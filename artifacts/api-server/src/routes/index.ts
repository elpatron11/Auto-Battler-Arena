import { Router, type IRouter } from "express";
import healthRouter from "./health";
import arenaRouter from "./arena";
import arenaRecordingsRouter from "./arena-recordings";
import arenaSocialRouter from "./arena-social";
import economyRouter from "./economy";
import dungeonRouter from "./dungeon";
import storeRouter from "./store";
import guildRouter from "./guilds";
import guildWarsRouter from "./guild-wars";

const router: IRouter = Router();

router.use(healthRouter);
// Its public rotation endpoint must precede routers with blanket auth guards.
router.use(dungeonRouter);
router.use(storeRouter);
router.use(guildRouter);
router.use(guildWarsRouter);
router.use(arenaRouter);
router.use(arenaRecordingsRouter);
router.use(arenaSocialRouter);
router.use(economyRouter);

export default router;
