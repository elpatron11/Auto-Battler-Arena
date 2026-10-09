package com.fantasyworldarenas.prototype;

/** Pure policy, independently testable without a device or network. */
public final class PrototypePolicy {
    private PrototypePolicy() {}

    public static boolean blocksCheckout(String host, String path, String method) {
        return "auto-battler-arena.replit.app".equals(host)
            && ("/api/store/checkout".equals(path) || "/api/store/checkout/".equals(path))
            && "POST".equalsIgnoreCase(method);
    }
}
