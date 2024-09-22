const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');

// Set up Multer storage (ensure the 'uploads/abTestImages/' directory exists)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/abTestImages/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to accept only image files
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

// Route to handle A/B test creation
router.post('/create-ab-test', upload.fields([
    { name: 'imageA', maxCount: 1 }, 
    { name: 'imageB', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            imageAName,
            imageATargetUrl,
            imageBName,
            imageBTargetUrl
        } = req.body;

        const imageAFile = req.files['imageA'] ? req.files['imageA'][0] : null;
        const imageBFile = req.files['imageB'] ? req.files['imageB'][0] : null;

        // Validate required fields
        if (!imageAName || !imageATargetUrl || !imageBName || !imageBTargetUrl || !imageAFile || !imageBFile) {
            return res.status(400).json({ message: 'Image names, target URLs, and both images are required.' });
        }

        // Generate unique IDs for images
        const imageAId = new ObjectId();
        const imageBId = new ObjectId();

        // Prepare image data
        const imageAData = {
            _id: imageAId,
            imageId: imageAId.toString(),
            imageName: imageAName,
            imageUrl: '/uploads/abTestImages/' + imageAFile.filename, // Adjust the path as needed
            targetUrl: imageATargetUrl,
            variant: 'A',
            clickCount: 0,
            viewCount: 0, // Initialize viewCount
            uploadDate: new Date(),
        };

        const imageBData = {
            _id: imageBId,
            imageId: imageBId.toString(),
            imageName: imageBName,
            imageUrl: '/uploads/abTestImages/' + imageBFile.filename,
            targetUrl: imageBTargetUrl,
            variant: 'B',
            clickCount: 0,
            viewCount: 0, // Initialize viewCount
            uploadDate: new Date(),
        };

        // Insert images into the database
        await global.db.collection('abTestImages').insertMany([imageAData, imageBData]);

        res.status(200).json({ message: 'A/B Test created successfully.' });
    } catch (error) {
        console.error('Error creating A/B Test:', error);
        res.status(500).json({ message: 'Failed to create A/B Test.', error: error.message });
    }
});

// Endpoint to get A/B test image data
router.get('/get-ab-test-image', async (req, res) => {
    const { affiliateId, abChoice } = req.query;

    if (!affiliateId || !abChoice) {
        return res.status(400).json({ error: 'affiliateId and abChoice parameters are required' });
    }

    try {
        // Fetch the affiliate from the database
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        // Fetch the images for the A/B test
        const imageData = await global.db.collection('abTestImages').aggregate([
            { $match: { variant: abChoice } },
            { $sample: { size: 1 } } // Randomly select one image from the variant
        ]).toArray();

        if (imageData.length === 0) {
            return res.status(404).json({ error: 'No image found for the selected variant' });
        }

        const image = imageData[0];

        res.json({
            imageUrl: image.imageUrl,
            imageName: image.imageName,
            targetUrl: image.targetUrl,
            imageId: image.imageId,
            variant: abChoice,
        });
    } catch (error) {
        console.error('Failed to get A/B test image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to register click event
router.get('/register-click', async (req, res) => {
    const { affiliateId, imageId } = req.query;

    if (!affiliateId || !imageId) {
        return res.status(400).json({ error: 'affiliateId and imageId parameters are required' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate imageId existence
        const image = await global.db.collection('abTestImages').findOne({ imageId: imageId });
        if (!image) {
            return res.status(404).json({ error: 'Image not found.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the click event
        await global.db.collection('abTestClicks').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the click count in abTestImages
        await global.db.collection('abTestImages').updateOne(
            { imageId: imageId },
            { $inc: { clickCount: 1 } }
        );

        res.json({ message: 'Click event registered successfully' });
    } catch (error) {
        console.error('Failed to register click event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to register view event
router.get('/register-view', async (req, res) => {
    const { affiliateId, imageId } = req.query;

    if (!affiliateId || !imageId) {
        return res.status(400).json({ error: 'affiliateId and imageId parameters are required.' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate imageId existence
        const image = await global.db.collection('abTestImages').findOne({ imageId: imageId });
        if (!image) {
            return res.status(404).json({ error: 'Image not found.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the view event
        await global.db.collection('abTestViews').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the view count in abTestImages
        await global.db.collection('abTestImages').updateOne(
            { imageId: imageId },
            { $inc: { viewCount: 1 } }
        );

        res.json({ message: 'View event registered successfully.' });
    } catch (error) {
        console.error('Failed to register view event:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to get A/B test results for the last 7 days
router.get('/get-ab-test-results', async (req, res) => {
    const { affiliateId } = req.query;

    try {
        // Get the current date and the date 6 days ago (to include today, making it 7 days)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6); // Including today

        const startDate = sevenDaysAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const endDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

        // Build the $match stage based on whether affiliateId is provided
        let matchStage = {
            date: { $gte: startDate, $lte: endDate }
        };

        if (affiliateId) {
            // Validate affiliateId format
            if (!ObjectId.isValid(affiliateId)) {
                return res.status(400).json({ error: 'Invalid affiliateId format.' });
            }

            matchStage.affiliateId = new ObjectId(affiliateId);
        }

        // Aggregation Pipeline
        const pipeline = [
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: { imageId: '$imageId', date: '$date' },
                    clicks: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'abTestImages',
                    localField: '_id.imageId',
                    foreignField: 'imageId',
                    as: 'imageInfo'
                }
            },
            {
                $unwind: '$imageInfo'
            },
            // Lookup for views
            {
                $lookup: {
                    from: 'abTestViews',
                    let: { imageId: '$_id.imageId', date: '$_id.date' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$imageId', '$$imageId'] },
                                        { $eq: ['$date', '$$date'] }
                                    ]
                                }
                            }
                        },
                        {
                            $count: 'views'
                        }
                    ],
                    as: 'viewInfo'
                }
            },
            {
                $addFields: {
                    views: { $ifNull: [{ $arrayElemAt: ['$viewInfo.views', 0] }, 0] }
                }
            },
            {
                $project: {
                    date: '$_id.date',
                    imageId: '$_id.imageId',
                    clicks: 1,
                    views: 1,
                    imageUrl: '$imageInfo.imageUrl',
                    imageName: '$imageInfo.imageName',
                    variant: '$imageInfo.variant',
                    ...(affiliateId ? {} : { 
                        affiliateId: '$imageInfo.affiliateId' // Include affiliateId if not filtered
                    })
                }
            },
            {
                $sort: { date: 1 }
            }
        ];

        // Execute the aggregation pipeline
        const results = await global.db.collection('abTestClicks').aggregate(pipeline).toArray();

        res.json(results);
    } catch (error) {
        console.error('Failed to get A/B test results:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
