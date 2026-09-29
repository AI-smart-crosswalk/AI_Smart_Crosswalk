/*
========================================
Danger Analyzer

This file decides if detected objects are dangerous.
It runs each danger rule and returns the first
danger found, or a safe result.
========================================
*/

class DangerAnalyzer {
    /*
    ========================================
    Analyze Detections
    ========================================
    */
    analyze(detections) {
        // Run every rule and return the first danger, or a safe result.
        return this.checkRoi(detections)
            || this.checkPhoneUsage(detections)
            || { danger: false, confidence: 0, reason: null, metadata: {} };
    }

    /*
    ========================================
    Check Crosswalk Area
    ========================================
    */
    // TODO: Check if an object is inside the crosswalk area.
    checkRoi(detections) {
        return null;
    }

    /*
    ========================================
    Check Phone Usage
    ========================================
    */
    // TODO: Check if a person is using a phone while crossing.
    checkPhoneUsage(detections) {
        return null;
    }
}

export default new DangerAnalyzer();
