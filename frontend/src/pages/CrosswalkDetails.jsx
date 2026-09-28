import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

function CrosswalkDetails() {
  const { id } = useParams(); 
  const navigate = useNavigate();
  
  const [crosswalk, setCrosswalk] = useState(null);
  const [crosswalkCameras, setCrosswalkCameras] = useState([]);
  const [crosswalkLeds, setCrosswalkLeds] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  
  const [filterDate, setFilterDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCrosswalkData = async () => {
      setIsLoading(true);
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [cwRes, camRes, ledRes, alertsRes] = await Promise.all([
          fetch(`${apiUrl}/crosswalks`, { headers }),
          fetch(`${apiUrl}/cameras`, { headers }),
          fetch(`${apiUrl}/leds`, { headers }),
          fetch(`${apiUrl}/alerts`, { headers })
        ]);

        if (cwRes.ok && camRes.ok && ledRes.ok && alertsRes.ok) {
          const allCrosswalks = await cwRes.json();
          const allCameras = await camRes.json();
          const allLeds = await ledRes.json();
          const allAlerts = await alertsRes.json();

          const currentCrosswalk = allCrosswalks.find(cw => cw._id === id);
          if (currentCrosswalk) {
            setCrosswalk(currentCrosswalk);
            setCrosswalkCameras(allCameras.filter(cam => cam.junctionId === id));
            setCrosswalkLeds(allLeds.filter(led => led.junctionId === id));
            setHistoryEvents(allAlerts.filter(alert => alert.crosswalkId === id));
          }
        }
      } catch (err) {
        console.error("Error fetching crosswalk details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCrosswalkData();

    const socketUrl = import.meta.env.VITE_API_URL.replace('/api', ''); 
    const socket = io(socketUrl);

    socket.on('newAlert', (newAlert) => {
      if (newAlert.crosswalkId === id) {
        setHistoryEvents(prev => [newAlert, ...prev]);
      }
    });

    socket.on('alertUpdated', (updatedAlert) => {
      if (updatedAlert.crosswalkId === id) {
        setHistoryEvents(prev => prev.map(a => a._id === updatedAlert._id ? updatedAlert : a));
      }
    });

    socket.on('infra_updated', (data) => {
      if (data.type === 'crosswalk' && data.payload._id === id) setCrosswalk(data.payload);
      if (data.type === 'camera' && data.payload.junctionId === id) {
        setCrosswalkCameras(prev => prev.map(c => c._id === data.payload._id ? data.payload : c));
      }
      if (data.type === 'led' && data.payload.junctionId === id) {
        setCrosswalkLeds(prev => prev.map(l => l._id === data.payload._id ? data.payload : l));
      }
    });

    return () => socket.disconnect();
  }, [id]);

  const filteredEvents = historyEvents.filter(event => {
    if (!filterDate) return true;
    const eventDate = event.timestamp ? event.timestamp.split('T')[0] : '';
    return eventDate === filterDate;
  });

  const getSeverityBadge = (severity) => {
    const s = severity?.toLowerCase();
    if (s === 'high') return <span className="bg-red-100 text-red-800 px-2 py-1 rounded font-bold text-xs border border-red-200 whitespace-nowrap">🔴 קריטי</span>;
    if (s === 'medium') return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold text-xs border border-orange-200 whitespace-nowrap">🟠 בינוני</span>;
    return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold text-xs border border-blue-200 whitespace-nowrap">🔵 נמוך</span>;
  };

  const formatDateDisplay = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('he-IL');
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const isCamerasOk = crosswalkCameras.length > 0 && !crosswalkCameras.some(c => c.status === 'error' || c.status === 'suspended');
  const isLedsOk = crosswalkLeds.length > 0 && !crosswalkLeds.some(l => l.status === 'error' || l.status === 'suspended');

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
        <span className="text-slate-500 font-medium">טוען נתוני צומת...</span>
      </div>
    );
  }

  if (!crosswalk) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100" dir="rtl">
        <h2 className="text-2xl font-bold text-slate-700">הצומת לא נמצא</h2>
        <button onClick={() => navigate(-1)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold transition">חזור אחורה</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      
      <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">תיק צומת: {crosswalk.name}</h1>
            <p className="text-slate-500 mt-1">{crosswalk.street ? `${crosswalk.street}, ` : ''}{crosswalk.city} | מזהה: {crosswalk._id}</p>
        </div>
        <button 
            onClick={() => navigate(-1)}
            className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition shadow font-bold"
        >
            חזור אחורה
        </button>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 md:col-span-1 h-fit">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-xl font-bold text-slate-700">סטטוס ציוד מנטר</h2>
                <span className={`text-xs px-2 py-1 rounded font-bold ${crosswalk.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {crosswalk.status === 'active' ? 'צומת תקין' : 'צומת בתקלה'}
                </span>
            </div>
            
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">מצלמות מותקנות:</span>
                    <span className="font-bold text-lg">{crosswalkCameras.length}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">מצב מצלמות:</span>
                    {crosswalkCameras.length === 0 ? (
                        <span className="font-bold px-2 py-1 rounded text-sm bg-slate-100 text-slate-500">אין ציוד</span>
                    ) : (
                        <span className={`font-bold px-2 py-1 rounded text-sm ${isCamerasOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {isCamerasOk ? 'פעיל 🟢' : 'תקלה 🔴'}
                        </span>
                    )}
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">מערכת לדים:</span>
                    {crosswalkLeds.length === 0 ? (
                        <span className="font-bold px-2 py-1 rounded text-sm bg-slate-100 text-slate-500">אין ציוד</span>
                    ) : (
                        <span className={`font-bold px-2 py-1 rounded text-sm ${isLedsOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {isLedsOk ? 'פעיל 🟢' : 'תקלה 🔴'}
                        </span>
                    )}
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">קואורדינטות:</span>
                    <span className="font-mono text-xs text-slate-500" dir="ltr">{crosswalk.lat || '-'}, {crosswalk.lng || '-'}</span>
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 md:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b pb-2">
                <h2 className="text-xl font-bold text-slate-700">היסטוריית אירועים מסוכנים</h2>
                
                <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-500">סנן תאריך:</label>
                    <input 
                        type="date" 
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                    />
                    {filterDate && (
                        <button onClick={() => setFilterDate('')} className="text-xs text-red-500 hover:underline">נקה</button>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto h-[400px] overflow-y-auto relative">
                <table className="w-full text-right min-w-[500px]">
                    <thead className="bg-white sticky top-0 shadow-sm z-10">
                        <tr className="text-slate-500 text-sm border-b">
                            <th className="py-3 px-4 font-bold">תאריך ושעה</th>
                            <th className="py-3 px-4 font-bold">חומרה</th>
                            <th className="py-3 px-4 font-bold">תיאור המקרה</th>
                            <th className="py-3 px-4 font-bold">תיעוד</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredEvents.map(ev => (
                            <tr key={ev._id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-mono text-sm text-slate-600 whitespace-nowrap">
                                    <div>{formatDateDisplay(ev.timestamp)}</div>
                                    <div className="text-slate-400">{formatTime(ev.timestamp)}</div>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">{getSeverityBadge(ev.severity)}</td>
                                <td className="py-3 px-4 font-bold text-slate-700">{ev.description}</td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                    {ev.imageUrl ? (
                                        <a href={ev.imageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition cursor-pointer">
                                            <span className="text-xs underline font-bold">צפה בתמונה</span>
                                            <span className="text-lg">🖼️</span>
                                        </a>
                                    ) : (
                                        <span className="text-xs text-slate-400">ללא תמונה</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredEvents.length === 0 && (
                            <tr>
                                <td colSpan="4" className="py-8 text-center text-slate-500">
                                    לא נמצאו אירועים בתאריך זה.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </div>
  );
}

export default CrosswalkDetails;