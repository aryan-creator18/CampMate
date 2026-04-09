require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'campmate'
});

async function seed() {
  console.log('🌱 Starting database seed...');
  
  try {
    // 1. Clean existing tables (in correct foreign key order)
    console.log('🧹 Truncating existing tables...');
    await pool.query(`
      TRUNCATE TABLE 
        event_registrations, 
        club_members, 
        notifications, 
        announcements,
        events, 
        clubs, 
        users, 
        campus_locations 
      RESTART IDENTITY CASCADE;
    `);

    // 2. Insert Users
    console.log('👤 Seeding Users...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash('Test@1234', saltRounds);

    const usersRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, bio) VALUES 
        ('Aryan Sharma', 'student@campmate.com', $1, 'Student', 'Just a regular student.'),
        ('Priya Reddy', 'club@campmate.com', $1, 'Club Member', 'Tech enthusiast & builder.'),
        ('Admin Sir', 'admin@campmate.com', $1, 'Administrator', 'Campus systems administrator.')
      RETURNING id, role;
    `, [passwordHash]);
    
    const users = usersRes.rows;
    const student = users.find(u => u.role === 'Student');
    const clubMember = users.find(u => u.role === 'Club Member');
    const admin = users.find(u => u.role === 'Administrator');

    // 3. Insert Clubs
    console.log('⛺ Seeding Clubs...');
    const clubsRes = await pool.query(`
      INSERT INTO clubs (club_name, description, created_by) VALUES 
        ('Coding Club', 'A community of passionate developers building cool things. Join us for hackathons and masterclasses!', $1),
        ('CCB', 'The heartbeat of cultural events at BVRIT! We orchestrate massive college fests, electrifying events, and serve as the vibrant soul of campus life!', $1),
        ('CCB Dance Crew', 'Step up and own the stage! Our elite dance crew represents BVRIT across all major competitions. Bring your rhythm and let''s groove!', $1),
        ('Natyanandhana', 'Embrace grace and tradition! We are dedicated exclusively to the breathtaking art of classical dance, preserving heritage through mesmerizing performances.', $1),
        ('Musically BVRIT', 'Find your rhythm and raise your voice! The official hub for all vocalists and musicians. From battle of the bands to soulful acoustic nights, we do it all!', $1),
        ('Garuda', 'Master the art of defense and infiltration! Garuda is our elite cyber security club dedicated to ethical hacking, cryptography, and securing the digital frontier.', $1),
        ('E-Cell', 'Ignite your startup journey! The Entrepreneurship Cell (E-Cell) fosters innovation, connects you with industry leaders, and helps turn your visionary ideas into successful businesses.', $1),
        ('MHC (Mental Health Club)', 'Prioritize your well-being! The Mental Health Club (MHC) provides a safe, supportive space for students to destress, find balance, and promote mindfulness across campus.', $1),
        ('Chalana Chitram BVRIT', 'Lights, camera, action! Chalana Chitram BVRIT is your creative outlet for all things film making. From scriptwriting to directing, join us in bringing incredible stories to the big screen.', $1),
        ('Sports Club', 'Unleash your inner champion! Promoting fitness, organizing inter-college tournaments, and dominating the field.', $1)
      RETURNING id, club_name;
    `, [admin.id]);
    
    const clubs = clubsRes.rows;
    const codingClub = clubs.find(c => c.club_name === 'Coding Club');
    const culturalClub = clubs.find(c => c.club_name === 'CCB');
    const sportsClub = clubs.find(c => c.club_name === 'Sports Club');
    const natyanandhana = clubs.find(c => c.club_name === 'Natyanandhana');
    const ccbDanceCrew = clubs.find(c => c.club_name === 'CCB Dance Crew');
    const eCell = clubs.find(c => c.club_name === 'E-Cell');

    // 4. Insert Club Members
    console.log('👥 Seeding Club Members...');
    await pool.query(`
      INSERT INTO club_members (user_id, club_id, role) VALUES 
        ($1, $2, 'Admin'),    -- Priya is Admin of Coding Club
        ($3, $2, 'Member'),   -- Aryan is Member of Coding Club
        ($3, $4, 'Member')    -- Aryan is Member of Cultural Club
    `, [clubMember.id, codingClub.id, student.id, culturalClub.id]);

    // 5. Insert Events
    console.log('📅 Seeding Events...');
    const now = new Date();
    
    const event1Date = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const event2Date = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const event3Date = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const event4Date = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
    const event5Date = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    // Format dates to YYYY-MM-DD for Postgres
    const formatDate = (d) => d.toISOString().split('T')[0];

    const eventsInserted = await pool.query(`
      INSERT INTO events (title, description, date, time, venue, organizer_id, category, max_participants) VALUES 
        ('Hackathon 2026', 'A 24-hour coding sprint. Build next-gen web apps and win prizes.', $1, '09:00:00', 'Main Auditorium', $2, 'Technical', 100),
        ('AI Workshop', 'Hands-on session on building RAG pipelines with OpenAI.', $3, '14:00:00', 'Computer Lab 3', $2, 'Workshop', 50),
        ('Annual Fest Dance Off', 'Inter-department dance competition. Bring your best moves!', $4, '17:30:00', 'Open Air Theatre', $5, 'Cultural', NULL),
        ('Cricket Tournament Finale', 'The final showdown between CSE and ECE departments.', $6, '15:00:00', 'Main Ground', $7, 'Sports', 200),
        ('Resume Review Session', 'Get your resume reviewed by industry experts before placements.', $8, '10:00:00', 'Seminar Hall', $2, 'Other', 60)
      RETURNING id, title;
    `, [
      formatDate(event1Date), codingClub.id, 
      formatDate(event2Date), // $3
      formatDate(event3Date), culturalClub.id, // $4, $5
      formatDate(event4Date), sportsClub.id, // $6, $7
      formatDate(event5Date) // $8
    ]);

    // Insert Natyanandhana past event with poster
    await pool.query(`
      INSERT INTO events (title, description, date, time, venue, organizer_id, category, poster_url) VALUES 
        ('Nritya (Classical) – Athenes 2K26',
         'Natyanandhana proudly presented Dr. Sravya Manasa as the esteemed judge for the Nritya Classical dance competition at Athenes 2K26. An electrifying performance evening that celebrated the grace, tradition, and artistry of Indian classical dance forms at BVRIT.',
         '2026-04-01', '17:00:00', 'Open Air Theatre, BVRIT', $1, 'Cultural',
         '/events/natyanandhana-nritya-judge.png')
    `, [natyanandhana.id]);

    // Insert CCB Dance Crew past event with poster
    await pool.query(`
      INSERT INTO events (title, description, date, time, venue, organizer_id, category, poster_url) VALUES 
        ('Nritya (Western) – Athenes 2K26',
         'CCB Dance Crew proudly presented SREE as the electrifying judge for the Nritya Western dance competition at Athenes 2K26. A high-energy showdown of contemporary and western dance styles that set the stage on fire at BVRIT.',
         '2026-04-01', '18:30:00', 'Open Air Theatre, BVRIT', $1, 'Cultural',
         '/events/ccb-dance-crew-nritya-western-judge.png')
    `, [ccbDanceCrew.id]);

    // Insert E-Cell past event with poster
    await pool.query(`
      INSERT INTO events (title, description, date, time, venue, organizer_id, category, poster_url) VALUES 
        ('E-Summit''26 – Summer Edition',
         'E-Cell BVRIT hosted the electrifying E-Summit''26 Summer Edition on 25th–26th March, featuring Investment Arena, Brand Wars, Ad Arena, Pitch Perfect, Panel Discussion, and IPL Auction. Led by E-Cell leads Rishi Srii Reddy D and Satya Sai, the 2-day entrepreneurship extravaganza brought together innovators, investors, and future leaders at BVRIT.',
         '2026-03-25', '09:00:00', 'BVRIT Campus, Narsapur', $1, 'Other',
         '/events/ecell-esummit-2026.png')
    `, [eCell.id]);
    
    const eventsList = eventsInserted.rows;

    // 6. Insert Event Registrations
    console.log('🎟️ Seeding Event Registrations...');
    await pool.query(`
      INSERT INTO event_registrations (user_id, event_id, status) VALUES 
        ($1, $4, 'Confirmed'), -- Student -> Hackathon
        ($1, $5, 'Confirmed'), -- Student -> AI Workshop
        ($2, $4, 'Confirmed'), -- Club Member -> Hackathon
        ($3, $6, 'Confirmed')  -- Admin -> Annual Fest
    `, [
      student.id, 
      clubMember.id, 
      admin.id, 
      eventsList.find(e => e.title.includes('Hackathon')).id,
      eventsList.find(e => e.title.includes('AI Workshop')).id,
      eventsList.find(e => e.title.includes('Annual Fest')).id
    ]);

    // 7. Insert Campus Locations (Around BVRIT Narsapur)
    console.log('📍 Seeding Campus Locations...');
    await pool.query(`
      INSERT INTO campus_locations (location_name, description, latitude, longitude) VALUES 
        ('Main Administration Block', 'Principal office, admin affairs, and fees submission.', 17.7265, 78.2542),
        ('Central Library', 'Three stories of engineering books, journals, and a digital library.', 17.7258, 78.2536),
        ('Aryabhatta Core Lab Block', 'Computer Science and IT department labs.', 17.7241, 78.2558),
        ('Student Cafeteria', 'Multi-cuisine central canteen and student hangout spot.', 17.7235, 78.2561),
        ('Vishveshwarya Sports Complex', 'Indoor stadium, gym, and main cricket ground.', 17.7275, 78.2570)
    `);

    console.log('✅ Seeding completed successfully!');
    
  } catch (err) {
    console.error('❌ Seeding failed with error:', err);
    process.exit(1);
  } finally {
    // End the pool to allow the script to exit gracefully
    await pool.end();
    process.exit(0);
  }
}

seed();
