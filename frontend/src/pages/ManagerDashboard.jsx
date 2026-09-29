import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client'; 
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';

function ManagerDashboard() {
  const navigate = useNavigate();
  
  const [intersectionFilter, setIntersectionFilter] = useState('top5');
  const [isLoading, setIsLoading] = useState(true);
  
  // הסטייט החדש - מחזיק את כל הנתונים המחושבים שהבאקאנד שולח
  const [dashboardData, setDashboardData] = useState({
    stats: { totalAlerts: 0, highRisk: 0, activeCrosswalks: 0, totalCrosswalks: 0, avgResponseTime: 0 },
    intersections: [],
    weekly: [],
    severity: []
  });

  // פונקציית המשיכה מהשרת הופרדה כדי שנוכל לקרוא לה גם כשמשתנה פילטר וגם כשמתקבל סוקט
  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // שולחים בקשה לראוט האנליטיקה החדש של יוסף, ומעבירים לו את הפילטר הנוכחי
      const response = await fetch(`${apiUrl}/analytics/dashboard?filter=${intersectionFilter}`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  
useEffect(() => {

  // Initial request:
  // Get the current dashboard data from the database.
  fetchDashboardData();

  // Connect to the backend Socket.io server.
  const socketUrl =
    import.meta.env.VITE_API_URL.replace('/api', '');

  const socket = io(socketUrl);


  // Increase the counter when an alert becomes resolved.
  socket.on('alert_resolved', () => {

    setDashboardData((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        totalAlerts: prev.stats.totalAlerts + 1
      }
    }));

  });


  // Decrease the counter when a resolved alert is reopened.
  socket.on('alert_reopened', () => {

    setDashboardData((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        totalAlerts: Math.max(
          0,
          prev.stats.totalAlerts - 1
        )
      }
    }));

  });


  // Refresh dashboard data when a crosswalk is added.
  socket.on('infra_added', (data) => {

    if (data.type === 'crosswalk') {
      fetchDashboardData();
    }

  });


  // Refresh dashboard data when a crosswalk is updated.
  socket.on('infra_updated', (data) => {

    if (data.type === 'crosswalk') {
      fetchDashboardData();
    }

  });


  // Refresh dashboard data when a crosswalk is deleted.
  socket.on('infra_deleted', (data) => {

    if (data.type === 'crosswalk') {
      fetchDashboardData();
    }

  });


  // Disconnect when leaving the page.
  return () => {

    socket.off('alert_resolved');
    socket.off('alert_reopened');

    socket.off('infra_added');
    socket.off('infra_updated');
    socket.off('infra_deleted');

    socket.disconnect();

  };

}, [intersectionFilter]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const handleExportPDF = () => {
    window.print();
  };

  const severityColors = ['#ef4444', '#f59e0b', '#3b82f6'];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans" dir="rtl">
      
      <aside className="w-full md:w-64 bg-slate-900 text-white p-4 md:p-6 flex flex-col md:justify-between shadow-xl z-20 shrink-0 md:h-full print:hidden">
        <div>
          <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-8 text-center border-b border-slate-700 pb-4">
            SafeCross 🚦<br/><span className="text-xs md:text-sm font-normal text-slate-400">ניהול אזורי</span>
          </h1>
          <nav className="flex flex-row md:flex-col gap-2 md:gap-3 text-slate-300 overflow-x-auto pb-2 md:pb-0 whitespace-nowrap">
            <button className="text-right hover:text-white bg-slate-800 px-4 py-2 md:p-3 rounded font-medium transition shadow-sm border border-slate-700 text-blue-400 text-sm md:text-base">
              📊 לוח בקרה ראשי
            </button>
          </nav>
        </div>
        
        <div className="flex flex-col gap-3 mt-4 md:mt-0">
            <div className="bg-slate-800 px-3 py-2 md:p-3 rounded text-xs md:text-sm text-center border border-slate-700">
              מנהל מחובר: אזור מרכז
            </div>
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded transition font-bold shadow-md text-sm md:text-base">
                התנתק
            </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 flex flex-col overflow-y-auto w-full">
        <header className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800">מבט על אזורי - ניתוח בטיחות</h2>
            <p className="text-sm md:text-base text-slate-500 mt-1">פילוח נתוני AI וביצועי צמתים בשבוע האחרון</p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto print:hidden">
            <button onClick={handleExportPDF} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded shadow-sm hover:bg-slate-50 transition font-medium w-full sm:w-auto text-sm md:text-base flex justify-center items-center gap-2 cursor-pointer">
                יצא דוח PDF 📥
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
                <span className="text-slate-500 text-xs md:text-sm font-bold">אירועי AI שטופלו</span>
                <span className="text-2xl md:text-3xl font-black text-slate-800 mt-1">{dashboardData.stats.totalAlerts}</span>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
                <span className="text-slate-500 text-xs md:text-sm font-bold">צמתים תקינים</span>
                <span className="text-2xl md:text-3xl font-black text-blue-600 mt-1">{dashboardData.stats.activeCrosswalks} / {dashboardData.stats.totalCrosswalks}</span>
            </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
            <span className="text-slate-500 text-sm font-medium">השרת מבצע חישובים ומכין נתונים...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 pb-6">
              
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[22rem] flex flex-col">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                      <h3 className="font-bold text-slate-700 text-sm md:text-base">
                          {intersectionFilter === 'top5' ? '5 הצמתים עם כמות אירועי הסכנה הגבוהה ביותר' : 
                           intersectionFilter === 'school' ? 'אירועי סכנה בקרבת מוסדות חינוך' : 'אירועי סכנה בכלל הצמתים'}
                      </h3>
                      <select 
                          value={intersectionFilter}
                          onChange={(e) => setIntersectionFilter(e.target.value)}
                          className="border border-slate-300 rounded px-2 py-1 text-sm text-slate-600 outline-none focus:border-blue-500 cursor-pointer w-full sm:w-auto print:hidden"
                      >
                          <option value="top5">🔥 5 המסוכנים ביותר</option>
                          <option value="school">🏫 סביבת מוסדות חינוך</option>
                          <option value="all">🚦 כל הצמתים</option>
                      </select>
                  </div>
                  <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dashboardData.intersections} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 11}} />
                              <YAxis tick={{fill: '#64748b', fontSize: 11}} />
                              <Tooltip cursor={{fill: '#f1f5f9'}} />
                              <Legend wrapperStyle={{fontSize: '11px'}} />
                              <Bar dataKey="children" name="ילדים" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="adults" name="מבוגרים" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="vehicles" name="רכבים" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[22rem] flex flex-col">
                  <h3 className="font-bold text-slate-700 mb-1 text-sm md:text-base">מגמת עומס אירועי בטיחות (שבועי)</h3>
                  <p className="text-xs text-slate-500 mb-4">משקף סכנות מבוססות AI בלבד שטופלו</p>
                  <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dashboardData.weekly} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 11}} />
                              <YAxis tick={{fill: '#64748b', fontSize: 11}} />
                              <Tooltip />
                              <Line type="monotone" dataKey="safetyAlerts" name="כמות אירועי סכנה" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4, fill: '#8b5cf6'}} activeDot={{r: 6}} />
                          </LineChart>
                      </ResponsiveContainer>
                  </div>
              </div>
              
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[22rem] flex flex-col lg:col-span-2">
                  <h3 className="font-bold text-slate-700 mb-2 text-sm md:text-base">פילוח חומרת אירועים (מבוסס אחוזי סיכון ה-AI)</h3>
                  <div className="flex-1 w-full flex justify-center items-center">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                  data={dashboardData.severity}
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={55}
                                  outerRadius={75}
                                  paddingAngle={5}
                                  dataKey="value"
                              >
                                  {dashboardData.severity.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={severityColors[index % severityColors.length]} />
                                  ))}
                              </Pie>
                              <Tooltip />
                              <Legend 
                                  verticalAlign="bottom" 
                                  height={36} 
                                  formatter={(value, entry) => <span className="text-slate-700 font-medium text-xs md:text-sm mx-2">{value}</span>}
                              />
                          </PieChart>
                      </ResponsiveContainer>
                  </div>
              </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default ManagerDashboard;