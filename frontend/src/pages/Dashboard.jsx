import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Calendar, Bell, Sparkles, MapPin, ChevronRight, Activity, TrendingUp, Zap, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const METRICS = [
  {
    label: 'Upcoming Events',
    value: '12',
    change: '+3 this week',
    icon: Calendar,
    gradient: 'from-violet-500 to-brand-500',
    bg: 'from-brand-50 to-violet-50',
    iconBg: 'bg-gradient-to-br from-brand-500 to-violet-600',
  },
  {
    label: 'My Registered',
    value: '3',
    change: '2 upcoming',
    icon: Activity,
    gradient: 'from-emerald-400 to-teal-500',
    bg: 'from-emerald-50 to-teal-50',
    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-500',
  },
  {
    label: 'New Announcements',
    value: '5',
    change: '2 unread',
    icon: Bell,
    gradient: 'from-amber-400 to-orange-500',
    bg: 'from-amber-50 to-orange-50',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
  },
];

const ANNOUNCEMENTS = [
  { id: 1, club: 'Robotics Club', message: 'Meeting postponed to Friday 5 PM.', time: '2h ago', dot: 'bg-blue-500' },
  { id: 2, club: 'CCB', message: 'Auditions for the annual play are open!', time: '1d ago', dot: 'bg-rose-500' },
  { id: 3, club: 'E-Cell', message: 'E-Summit registrations close tomorrow!', time: '2d ago', dot: 'bg-amber-500' },
];

const CLUB_COLORS = {
  'Coding Club':            'bg-blue-500',
  'CCB':                    'bg-rose-500',
  'CCB Dance Crew':         'bg-purple-500',
  'Natyanandhana':          'bg-orange-400',
  'Musically BVRIT':        'bg-green-400',
  'Garuda':                 'bg-red-500',
  'E-Cell':                 'bg-amber-400',
  'MHC (Mental Health Club)': 'bg-teal-400',
  'Chalana Chitram BVRIT':  'bg-indigo-500',
  'Sports Club':            'bg-lime-500',
};

const Dashboard = () => {
  const { user } = useAuth();
  const [recommendedEvents, setRecommendedEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    // Fetch upcoming events from backend
    axios.get('http://localhost:5000/api/events?upcoming=true&limit=4')
      .then(res => {
        if(res.data?.data) {
          setRecommendedEvents(res.data.data);
        }
      })
      .catch(err => console.error('Failed to fetch recommended events:', err))
      .finally(() => setLoadingEvents(false));
  }, []);

  const formatTime = (timeString) => {
    if (!timeString) return '';
    try {
      const [hours, minutes] = timeString.split(':');
      const date = new Date();
      date.setHours(parseInt(hours, 10));
      date.setMinutes(parseInt(minutes, 10));
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeString;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">

      {/* Hero Header */}
      <div className="relative rounded-3xl overflow-hidden p-8 md:p-10"
        style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 40%, #8b5cf6 70%, #a78bfa 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-16 w-32 h-32 rounded-full bg-white/5 translate-y-1/2" />
        <div className="absolute top-1/2 right-1/4 w-16 h-16 rounded-full bg-white/10 -translate-y-1/2" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-4 border border-white/20">
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-white/90 text-xs font-semibold">Campus Activity Hub</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/70 text-base max-w-md">
            Here's what's happening around your campus today. Stay connected and never miss a moment.
          </p>
          <Link to="/events"
            className="inline-flex items-center gap-2 mt-6 bg-white text-brand-700 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-brand-50 transition-colors shadow-lg">
            Explore Events <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {METRICS.map((m, i) => (
          <div key={i}
            className={`relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br ${m.bg} border border-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 group`}
            style={{ animationDelay: `${i * 0.1}s` }}>
            <div className={`absolute -top-4 -right-4 w-24 h-24 rounded-full bg-gradient-to-br ${m.gradient} opacity-10 group-hover:opacity-20 transition-opacity blur-xl`} />
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-xl ${m.iconBg} flex items-center justify-center shadow-md`}>
                <m.icon className="h-5 w-5 text-white" />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3" /> {m.change}
              </span>
            </div>
            <p className="text-4xl font-bold text-gray-900 tracking-tight">{m.value}</p>
            <p className="text-sm text-gray-500 mt-0.5 font-medium">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recommended Events */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
              Upcoming Campus Events
            </h2>
            <Link to="/events" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loadingEvents ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="card p-5 animate-pulse h-48 border-gray-100" />
              ))}
            </div>
          ) : recommendedEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recommendedEvents.slice(0, 4).map((ev, i) => {
                const dotColor = CLUB_COLORS[ev.organizer_name] || 'bg-brand-500';
                return (
                  <div key={ev.id}
                    className="group card p-5 hover:-translate-y-1 cursor-pointer"
                    style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                         <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                         <span className="text-xs font-semibold text-gray-500">{ev.organizer_name}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 bg-brand-50 text-brand-600 rounded-full">{ev.category}</span>
                    </div>
                    <h3 className="font-bold text-base text-gray-900 mb-3 group-hover:text-brand-700 transition-colors line-clamp-1" title={ev.title}>{ev.title}</h3>
                    <div className="space-y-1.5 text-sm text-gray-500 mb-5">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-brand-400" />
                        <span>{formatDate(ev.date)} · {formatTime(ev.time)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-brand-400" />
                        <span className="truncate max-w-[200px]" title={ev.venue}>{ev.venue}</span>
                      </div>
                    </div>
                    <Link to="/events" className="block text-center w-full py-2 bg-brand-50 group-hover:bg-brand-600 group-hover:text-white text-brand-600 text-sm font-semibold rounded-xl transition-all duration-300">
                      View Details
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-400 flex flex-col items-center justify-center">
               <Calendar className="h-10 w-10 mb-2 opacity-50" />
               <p className="font-semibold text-gray-500">No upcoming events found</p>
            </div>
          )}
        </div>

        {/* Announcements */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-600" />
            </div>
            Announcements
          </h2>
          <div className="card divide-y divide-gray-50 overflow-hidden">
            {ANNOUNCEMENTS.map((ann) => (
              <div key={ann.id} className="p-4 hover:bg-brand-50/40 transition-colors group cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ann.dot}`} />
                    <span className="text-sm font-semibold text-gray-900">{ann.club}</span>
                  </div>
                  <span className="text-xs text-gray-400">{ann.time}</span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed pl-4">{ann.message}</p>
              </div>
            ))}
          </div>

          {/* Quick Links */}
          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Links</p>
            <div className="space-y-1">
              {[['Campus Map', '/map', '🗺️'], ['My Events', '/events', '📅'], ['All Clubs', '/clubs', '🎭']].map(([name, path, emoji]) => (
                <Link key={path} to={path}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-brand-50 text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors group">
                  <span className="flex items-center gap-2">{emoji} {name}</span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
