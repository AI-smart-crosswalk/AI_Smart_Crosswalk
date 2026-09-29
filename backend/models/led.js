/*
========================================
LED Model

This model represents an LED light strip embedded
in the road at a crosswalk. The LEDs light up to
warn drivers when a dangerous situation is detected.
It stores the LED name, health status, color,
the crosswalk it belongs to, and the last update time.

The structure matches what the frontend Admin
page sends (infrastructure management).

Relationships:
- LED -> Crosswalk (junctionId)
========================================
*/
import mongoose from "mongoose";
// Shared list of allowed statuses for crosswalks, cameras, and LEDs.
import { INFRA_STATUSES } from "./crosswalk.js";

/*
========================================
LED Schema
========================================
*/
const ledSchema = new mongoose.Schema({
    // LED strip name, e.g. "פס תאורה מערבי".
    name: { type: String, required: true },

    // LED health: 'active', 'error', or 'suspended' (default 'active').
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },

    // LED color, e.g. "אדום" | "ירוק" | "כתום".
    color: { type: String, default: '' },

    // The crosswalk this LED strip belongs to (LED -> Crosswalk).
    // Holds the crosswalk's _id and references the Crosswalk model.
    junctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crosswalk', required: true },

    // Last time the LED was changed (refreshed on every update).
    lastUpdated: { type: Date, default: Date.now },
});

// Create the LED model from the schema.
const LED = mongoose.model("LED", ledSchema);
export default LED;
