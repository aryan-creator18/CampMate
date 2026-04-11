const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Get all boundaries
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM campus_boundaries');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching boundaries:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin: Save boundary
router.post('/', requireAuth, requireRole('Administrator'), async (req, res) => {
  const { name, coordinates, color } = req.body;
  if (!name || !coordinates || coordinates.length < 3) {
    return res.status(400).json({ success: false, message: 'Invalid boundary data (requires name and at least 3 points)' });
  }

  try {
    const result = await db.query(
      'INSERT INTO campus_boundaries (name, coordinates, color) VALUES ($1, $2, $3) RETURNING *',
      [name, JSON.stringify(coordinates), color || '#3b82f6']
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Boundary saved successfully' });
  } catch (error) {
    console.error('Error saving boundary:', error);
    res.status(500).json({ success: false, message: 'Server error while saving boundary' });
  }
});

// Admin: Delete boundary
router.delete('/:id', requireAuth, requireRole('Administrator'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM campus_boundaries WHERE id = $1', [id]);
    res.json({ success: true, message: 'Boundary deleted successfully' });
  } catch (error) {
    console.error('Error deleting boundary:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting boundary' });
  }
});

module.exports = router;
