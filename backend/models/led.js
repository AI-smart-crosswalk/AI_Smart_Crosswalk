/**
 * models/led.js
 * -------------
 * Mongoose schema for the LED strip embedded in the road at a crosswalk.
 * Matches the structure the frontend Admin page sends (infra management).
 */
import mongoose from "mongoose";
import { INFRA_STATUSES } from "./crosswalk.js";

const ledSchema = new mongoose.Schema({
    name: { type: String, required: true },                                   // e.g. "פס תאורה מערבי"
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },        // LED health
    color: { type: String, default: '' },                                      // "אדום" | "ירוק" | "כתום"
    junctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crosswalk', required: true }, // the crosswalk it belongs to
    lastUpdated: { type: Date, default: Date.now },                            // last time it changed
});

const LED = mongoose.model("LED", ledSchema);
export default LED;
