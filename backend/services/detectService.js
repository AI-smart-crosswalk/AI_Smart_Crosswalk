/*
========================================
Detect Service

This file sends an image path to the AI service
and returns the detected objects to the client.
========================================
*/
import axios from "axios";                                  

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;          

/*
========================================
Detect Objects
========================================
*/
const detectObjects = async (req, res) => {
    try {
        const imagePath = req.body.imagePath;
        // Return an error if no image path was sent.
        if (!imagePath) {
            return res.status(400).json({ message: "imagePath is required" });
        }

        // Send the image path to the AI service for detection.
        const response = await axios.post(`${AI_SERVICE_URL}/detect`, { imagePath }); 
        return res.status(200).json(response.data);         
    } catch (error) {                                       // Pass on the AI service error, or return 500.
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data.detail : error.message;
        return res.status(status).json({ message });
    }
};

export default { detectObjects };                            
