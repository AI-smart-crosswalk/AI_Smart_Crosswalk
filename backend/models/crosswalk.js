/**
 * models/crosswalk.js
 * -------------------
 * Mongoose schema for a crosswalk / junction (a physical pedestrian crossing).
 * Matches the structure the frontend Admin page sends (infra management).
 * `_id` is a normal ObjectId created by the server; cameras and LEDs point to it
 * through their `junctionId` field.
 */
import mongoose from "mongoose";

export const INFRA_STATUSES = ['active', 'error', 'suspended'];

const crosswalkSchema = new mongoose.Schema({
    name: { type: String, required: true },                                   // e.g. "צומת קפלן"
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },        // health of the crosswalk
    city: { type: String, default: '' },                                       // e.g. "תל אביב"
    street: { type: String, default: '' },                                     // e.g. "אבן גבירול 10" (may be empty)
    lat: { type: Number },                                                     // latitude  (frontend sends a string; Mongoose casts it)
    lng: { type: Number },                                                     // longitude
    isSchoolZone: { type: Boolean, default: false },                           // near a school (Manager dashboard filter=school)
});

const Crosswalk = mongoose.model("Crosswalk", crosswalkSchema);
export default Crosswalk;
