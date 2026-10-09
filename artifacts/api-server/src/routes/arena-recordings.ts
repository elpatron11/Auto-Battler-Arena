import { getAuth } from "@clerk/express";
import {
  FinishArenaRecordingBody,
  FinishArenaRecordingParams,
  FinishArenaRecordingResponse,
  GetArenaRecordingParams,
  RequestArenaRecordingUploadBody,
  RequestArenaRecordingUploadParams,
  RequestArenaRecordingUploadResponse,
} from "@workspace/api-zod";
import { arenaChallengesTable, arenaFeaturedMatchesTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  isReplayVisibleToPlayer,
  isReplayUploadEligible,
  pruneReplaysForPlayers,
} from "../lib/replayRetention";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const maxRecordingBytes = 40_000_000;
const snapshotContentType = "application/vnd.arena.replay+json";
const maxSnapshotBytes = 6_000_000;
const acceptedContentTypes = new Set(["video/webm", "video/mp4", snapshotContentType]);

async function validSnapshotReplay(objectFile: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>): Promise<boolean> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of objectFile.createReadStream()) {
      bytes += chunk.length;
      if (bytes > maxSnapshotBytes) return false;
      chunks.push(chunk);
    }
    const replay: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!replay || typeof replay !== "object") return false;
    const { version, durationMs, frames } = replay as Record<string, unknown>;
    if (version !== 1 || typeof durationMs !== "number" || !Number.isInteger(durationMs) ||
      durationMs < 0 || durationMs > 3_600_000 || !Array.isArray(frames) ||
      frames.length < 1 || frames.length > 7200) return false;
    let previous = -1;
    for (const frame of frames) {
      if (!Array.isArray(frame) || frame.length !== 2 ||
        typeof frame[0] !== "number" || !Number.isInteger(frame[0]) ||
        frame[0] < previous || frame[0] > durationMs ||
        typeof frame[1] !== "string" || frame[1].length > 100_000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame[1])) return false;
      previous = frame[0];
    }
    return true;
  } catch {
    return false;
  }
}

router.use((req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access arena recordings." });
    return;
  }
  res.locals.playerId = userId;
  next();
});

function playerId(res: { locals: Record<string, unknown> }): string {
  return res.locals.playerId as string;
}

router.post("/arena/challenges/:challengeId/recording-upload", async (req, res): Promise<void> => {
  const params = RequestArenaRecordingUploadParams.safeParse(req.params);
  const body = RequestArenaRecordingUploadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid recording upload request." });
    return;
  }
  if (body.data.contentType === snapshotContentType && body.data.sizeBytes > maxSnapshotBytes) {
    res.status(400).json({ error: "Snapshot replays must be at most 6,000,000 bytes." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, params.data.challengeId)).for("update");
    if (!challenge || challenge.attackerId !== playerId(res)) return { error: "not_found" } as const;
    if (challenge.status !== "completed") return { error: "not_completed" } as const;
    if (challenge.recordingPath) return { error: "already_recorded" } as const;
    if (!await isReplayUploadEligible(tx, challenge.id, [challenge.attackerId, challenge.defenderId])) {
      return { error: "replay_expired" } as const;
    }

    const uploadUrl = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);
    if (!objectPath.startsWith("/objects/")) {
      throw new Error("Object storage returned an invalid private recording path.");
    }
    await tx.update(arenaChallengesTable)
      .set({ recordingUploadPath: objectPath })
      .where(eq(arenaChallengesTable.id, challenge.id));
    return { uploadUrl, objectPath } as const;
  });

  if ("error" in result) {
    res.status(result.error === "not_found" ? 404 : result.error === "replay_expired" ? 410 : 409).json({
      error: result.error === "not_found"
        ? "Challenge not found."
        : result.error === "not_completed"
          ? "Recordings are available only for completed challenges."
          : result.error === "replay_expired"
            ? "Replay uploads are no longer available for this challenge."
            : "A recording has already been finalized for this challenge.",
    });
    return;
  }
  res.json(RequestArenaRecordingUploadResponse.parse(result));
});

router.post("/arena/challenges/:challengeId/recording", async (req, res): Promise<void> => {
  const params = FinishArenaRecordingParams.safeParse(req.params);
  const body = FinishArenaRecordingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid recording finalization request." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, params.data.challengeId)).for("update");
    if (!challenge || challenge.attackerId !== playerId(res)) return { error: "not_found" } as const;
    if (challenge.status !== "completed") return { error: "not_completed" } as const;
    if (challenge.recordingPath) return { error: "already_recorded" } as const;
    if (!challenge.recordingUploadPath || body.data.objectPath !== challenge.recordingUploadPath) {
      return { error: "invalid_path" } as const;
    }

    let objectFile;
    try {
      objectFile = await objectStorage.getObjectEntityFile(challenge.recordingUploadPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return { error: "missing_file" } as const;
      throw error;
    }
    const [metadata] = await objectFile.getMetadata();
    const sizeBytes = Number(metadata.size);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 ||
      sizeBytes > (body.data.contentType === snapshotContentType ? maxSnapshotBytes : maxRecordingBytes)) {
      return { error: "invalid_size" } as const;
    }
    if (body.data.contentType === snapshotContentType && !await validSnapshotReplay(objectFile)) {
      return { error: "invalid_replay" } as const;
    }

    await objectFile.setMetadata({ contentType: body.data.contentType });
    await tx.update(arenaChallengesTable)
      .set({
        recordingPath: challenge.recordingUploadPath,
        recordingContentType: body.data.contentType,
      })
      .where(eq(arenaChallengesTable.id, challenge.id));
    return {
      challengeId: challenge.id,
      attackerId: challenge.attackerId,
      defenderId: challenge.defenderId,
    } as const;
  });

  if ("error" in result) {
    const status = result.error === "not_found" || result.error === "missing_file" ? 404 :
      result.error === "invalid_path" || result.error === "invalid_size" || result.error === "invalid_replay" ? 400 : 409;
    res.status(status).json({
      error: result.error === "not_found"
        ? "Challenge not found."
        : result.error === "not_completed"
          ? "Recordings are available only for completed challenges."
          : result.error === "already_recorded"
            ? "A recording has already been finalized for this challenge."
            : result.error === "invalid_path"
              ? "The uploaded object does not match the reserved recording."
              : result.error === "missing_file"
                ? "The uploaded recording was not found."
                : result.error === "invalid_replay"
                  ? "The uploaded snapshot replay is invalid."
                  : "The uploaded recording exceeds the replay size limit.",
    });
    return;
  }

  await pruneReplaysForPlayers([result.attackerId, result.defenderId]);
  res.json(FinishArenaRecordingResponse.parse({
    available: true,
    videoUrl: `/api/arena/challenges/${result.challengeId}/recording`,
  }));
});

router.get("/arena/challenges/:challengeId/recording", async (req, res): Promise<void> => {
  const params = GetArenaRecordingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid challenge ID." });
    return;
  }

  const [challenge] = await db.select().from(arenaChallengesTable)
    .where(eq(arenaChallengesTable.id, params.data.challengeId));
  const id = playerId(res);
  const isParticipant = challenge && (challenge.attackerId === id || challenge.defenderId === id);
  const [featured] = challenge && !isParticipant
    ? await db.select({ challengeId: arenaFeaturedMatchesTable.challengeId })
        .from(arenaFeaturedMatchesTable)
        .where(eq(arenaFeaturedMatchesTable.challengeId, challenge.id))
        .limit(1)
    : [];
  if (!challenge || (!isParticipant && !featured)) {
    res.status(404).json({ error: "Recording not found." });
    return;
  }
  if (isParticipant && !await db.transaction((tx) =>
    isReplayVisibleToPlayer(tx, challenge.id, id))) {
    res.status(404).json({ error: "Recording not found." });
    return;
  }
  if (challenge.status !== "completed" || !challenge.recordingPath ||
    !challenge.recordingContentType || !acceptedContentTypes.has(challenge.recordingContentType)) {
    res.status(404).json({ error: "Recording not found." });
    return;
  }

  let objectFile;
  try {
    objectFile = await objectStorage.getObjectEntityFile(challenge.recordingPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Recording not found." });
      return;
    }
    throw error;
  }
  const [metadata] = await objectFile.getMetadata();
  const sizeBytes = Number(metadata.size);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 ||
    sizeBytes > (challenge.recordingContentType === snapshotContentType ? maxSnapshotBytes : maxRecordingBytes)) {
    res.status(404).json({ error: "Recording not found." });
    return;
  }

  res.setHeader("Content-Type", challenge.recordingContentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");

  const rangeHeader = req.get("Range");
  let start = 0;
  let end = sizeBytes - 1;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", `bytes */${sizeBytes}`);
      res.status(416).end();
      return;
    }
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : sizeBytes - 1;
    } else {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.setHeader("Content-Range", `bytes */${sizeBytes}`);
        res.status(416).end();
        return;
      }
      start = Math.max(sizeBytes - suffixLength, 0);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || start >= sizeBytes || end < start) {
      res.setHeader("Content-Range", `bytes */${sizeBytes}`);
      res.status(416).end();
      return;
    }
    end = Math.min(end, sizeBytes - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${sizeBytes}`);
  } else {
    res.status(200);
  }

  res.setHeader("Content-Length", String(end - start + 1));
  const stream = rangeHeader
    ? objectFile.createReadStream({ start, end })
    : objectFile.createReadStream();
  stream.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.status(404).end();
  });
  stream.pipe(res);
});

export default router;