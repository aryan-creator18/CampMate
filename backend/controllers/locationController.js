const db = require('../db');
const { sendSuccess } = require('../utils/response');

// GET /api/locations — fetch all locations
const getAllLocations = async (req, res, next) => {
    try {
        const locations = await db.query(`
            SELECT l.*, b.location_name AS building_name
            FROM campus_locations l
            LEFT JOIN campus_locations b ON l.building_id = b.id
            ORDER BY l.category, l.location_name
        `);
        return sendSuccess(res, 'Locations fetched successfully', locations.rows);
    } catch (err) {
        next(err);
    }
};

// POST /api/locations — admin creates a new location (pin)
const createLocation = async (req, res, next) => {
    try {
        const { location_name, latitude, longitude, description, category, floor_number, image_url, building_id } = req.body;

        if (!location_name || !latitude || !longitude || !category) {
            return res.status(400).json({ success: false, message: 'name, latitude, longitude, and category are required.' });
        }

        const result = await db.query(
            `INSERT INTO campus_locations (location_name, latitude, longitude, description, category, floor_number, image_url, building_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [location_name, latitude, longitude, description || null, category, floor_number || null, image_url || null, building_id || null]
        );

        return sendSuccess(res, 'Location created successfully', result.rows[0], 201);
    } catch (err) {
        next(err);
    }
};

// PUT /api/locations/:id — admin updates a location
const updateLocation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { location_name, latitude, longitude, description, category, floor_number, image_url, building_id } = req.body;

        const result = await db.query(
            `UPDATE campus_locations
             SET location_name = COALESCE($1, location_name),
                 latitude      = COALESCE($2, latitude),
                 longitude     = COALESCE($3, longitude),
                 description   = COALESCE($4, description),
                 category      = COALESCE($5, category),
                 floor_number  = COALESCE($6, floor_number),
                 image_url     = COALESCE($7, image_url),
                 building_id   = COALESCE($8, building_id)
             WHERE id = $9
             RETURNING *`,
            [location_name, latitude, longitude, description, category, floor_number, image_url, building_id, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Location not found.' });
        }

        return sendSuccess(res, 'Location updated successfully', result.rows[0]);
    } catch (err) {
        next(err);
    }
};

// DELETE /api/locations/:id — admin deletes a location
const deleteLocation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM campus_locations WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Location not found.' });
        }

        return sendSuccess(res, 'Location deleted successfully', result.rows[0]);
    } catch (err) {
        next(err);
    }
};

module.exports = { getAllLocations, createLocation, updateLocation, deleteLocation };
