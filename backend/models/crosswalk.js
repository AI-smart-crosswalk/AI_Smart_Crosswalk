/*
========================================
Crosswalk Model

This model represents a crosswalk / junction
(a physical pedestrian crossing) in the SmartWalk
system. It stores the crosswalk name, health status,
address, map location, and whether it is near a school.

The structure matches what the frontend Admin
page sends (infrastructure management).

The _id is a normal MongoDB ObjectId created by the server.

Relationships:
- Camera -> Crosswalk (camera.junctionId)
- LED -> Crosswalk (led.junctionId)
- Alert -> Crosswalk (alert.crosswalkId holds the _id as text)
========================================
*/
import mongoose from "mongoose";

// Allowed health statuses for infrastructure.
// Shared with the Camera and LED models.
export const INFRA_STATUSES = ['active', 'error', 'suspended'];

/*
========================================
Crosswalk Schema
========================================
*/
const crosswalkSchema = new mongoose.Schema({
    // Crosswalk name, e.g. "צומת קפלן".
    name: { type: String, required: true },

    // Health of the crosswalk: 'active', 'error', or 'suspended' (default 'active').
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },

    // City, e.g. "תל אביב".
    city: { type: String, default: '' },

    // Street address, e.g. "אבן גבירול 10" (may be empty).
    street: { type: String, default: '' },

    // Map location.
    // The frontend sends latitude as a string; Mongoose converts it to a number.
    lat: { type: Number },
    lng: { type: Number },

    // true if the crosswalk is near a school.
    // Used by the Manager dashboard "school" filter.
    isSchoolZone: { type: Boolean, default: false },
});

// Create the Crosswalk model from the schema.
const Crosswalk = mongoose.model("Crosswalk", crosswalkSchema);
export default Crosswalk;
