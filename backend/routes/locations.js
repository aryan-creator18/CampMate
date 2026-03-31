const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { verifyToken, restrictTo } = require('../middleware/auth'); // adjust path if needed

// Public (authenticated users)
router.get('/', verifyToken, locationController.getAllLocations);

// Admin only
router.post('/',     verifyToken, restrictTo('Administrator'), locationController.createLocation);
router.put('/:id',   verifyToken, restrictTo('Administrator'), locationController.updateLocation);
router.delete('/:id',verifyToken, restrictTo('Administrator'), locationController.deleteLocation);

module.exports = router;
