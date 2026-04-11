const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./db');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const clubRoutes = require('./routes/clubs');
const locationRoutes = require('./routes/locations');
const pathRoutes = require('./routes/paths');
const boundaryRoutes = require('./routes/boundaries');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true })); // Important for cookies
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/paths', pathRoutes);
app.use('/api/boundaries', boundaryRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
  res.send('CampMate API is running');
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect to DB and start server
const startServer = async () => {
    try {
        await db.testConnection();
        console.log('✅ Database connected');
    } catch (err) {
        console.error('⚠️ Failed to start database connection, but starting server anyway:', err.message);
    }
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();
