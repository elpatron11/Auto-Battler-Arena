package com.fantasyworldarenas.prototype;

import static org.junit.Assert.*;
import org.junit.Test;

public class PrototypePolicyTest {
    @Test public void rejectsPaymentCreationOnly() {
        assertTrue(PrototypePolicy.blocksCheckout("auto-battler-arena.replit.app", "/api/store/checkout", "POST"));
        assertTrue(PrototypePolicy.blocksCheckout("auto-battler-arena.replit.app", "/api/store/checkout/", "post"));
        assertFalse(PrototypePolicy.blocksCheckout("auto-battler-arena.replit.app", "/api/store/checkout/cs_fixture", "GET"));
        assertFalse(PrototypePolicy.blocksCheckout("auto-battler-arena.replit.app", "/api/arena/challenges", "POST"));
        assertFalse(PrototypePolicy.blocksCheckout("auto-battler-arena.replit.app", "/api/store/rewards/claim", "POST"));
        assertFalse(PrototypePolicy.blocksCheckout("other.example", "/api/store/checkout", "POST"));
        assertFalse(PrototypePolicy.blocksCheckout(null, null, null));
    }
}
