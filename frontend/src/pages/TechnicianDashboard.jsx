import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import io from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function TechnicianDashboard() {
  const navigate = useNavigate();

  const [crosswalks, setCrosswalks] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [leds, setLeds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {

   
    const fetchTechnicianData = async () => {
      setIsLoading(true);

      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const token = localStorage.getItem('token');

        const headers = {
          'Authorization': `Bearer ${token}`
        };

        const [cwRes, camRes, ledRes] = await Promise.all([
          fetch(`${apiUrl}/crosswalks`, { headers }),
          fetch(`${apiUrl}/cameras`, { headers }),
          fetch(`${apiUrl}/leds`, { headers })
        ]);

        if (cwRes.ok && camRes.ok && ledRes.ok) {
          setCrosswalks(await cwRes.json());
          setCameras(await camRes.json());
          setLeds(await ledRes.json());
        }

      } catch (err) {
        console.error("Error fetching technician data:", err);

      } finally {
        setIsLoading(false);
      }
    };

    fetchTechnicianData();

    
    const socketUrl = import.meta.env.VITE_API_URL.replace('/api', '');
    const socket = io(socketUrl);

    socket.on('infra_added', (data) => {
      if (data.type === 'crosswalk') {
        setCrosswalks(prev => [...prev, data.payload]);
      }

      if (data.type === 'camera') {
        setCameras(prev => [...prev, data.payload]);
      }

      if (data.type === 'led') {
        setLeds(prev => [...prev, data.payload]);
      }
    });

    socket.on('infra_updated', (data) => {
      if (data.type === 'crosswalk') {
        setCrosswalks(prev =>
          prev.map(j =>
            j._id === data.payload._id ? data.payload : j
          )
        );
      }

      if (data.type === 'camera') {
        setCameras(prev =>
          prev.map(c =>
            c._id === data.payload._id ? data.payload : c
          )
        );
      }

      if (data.type === 'led') {
        setLeds(prev =>
          prev.map(l =>
            l._id === data.payload._id ? data.payload : l
          )
        );
      }
    });

    return () => socket.disconnect();

  }, []);

 
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  
  const handleFixHardware = async (itemType, itemId) => {

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const token = localStorage.getItem('token');

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      let endpoint = '';

      if (itemType === 'camera') {
        endpoint = `${apiUrl}/cameras/${itemId}`;
      }

      if (itemType === 'led') {
        endpoint = `${apiUrl}/leds/${itemId}`;
      }

      if (itemType === 'crosswalk') {
        endpoint = `${apiUrl}/crosswalks/${itemId}`;
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({
          status: 'active'
        })
      });

      if (!response.ok) {
        throw new Error('שגיאה בעדכון הסטטוס מול השרת');
      }

      // Update local state.
      if (itemType === 'camera') {
        setCameras(cameras.map(c =>
          c._id === itemId
            ? { ...c, status: 'active' }
            : c
        ));

      } else if (itemType === 'led') {
        setLeds(leds.map(l =>
          l._id === itemId
            ? { ...l, status: 'active' }
            : l
        ));

      } else if (itemType === 'crosswalk') {
        setCrosswalks(crosswalks.map(cw =>
          cw._id === itemId
            ? { ...cw, status: 'active' }
            : cw
        ));
      }

      alert('התקלה סומנה כטופלה בהצלחה!');

    } catch (err) {
      console.error(err);
      alert('שגיאה בעדכון התקלה בשרת');
    }
  };

  
  const faultyCameras = cameras.filter(
    c => c.status === 'error' || c.status === 'suspended'
  );

  const faultyLeds = leds.filter(
    l => l.status === 'error' || l.status === 'suspended'
  );

  const faultyCrosswalksList = crosswalks.filter(
    cw => cw.status === 'error' || cw.status === 'suspended'
  );

 
  const getLinkedCrosswalk = (junctionId) => {
    return crosswalks.find(cw => cw._id === junctionId);
  };

  
  const allFaultyItems = [

    ...faultyCrosswalksList.map(cw => ({
      ...cw,
      itemType: 'crosswalk',
      title: `צומת: ${cw.street ? cw.street + ', ' : ''}${cw.city}`,
      fault: 'תקלת מערכת מרכזית'
    })),

    ...faultyCameras.map(cam => {
      const linkedCrosswalk = getLinkedCrosswalk(cam.junctionId);

      return {
        ...cam,
        itemType: 'camera',
        title: `מצלמה (IP: ${cam.ip})`,
        fault: `תקלת מצלמה (${cam.type})`,

        lat: linkedCrosswalk?.lat,
        lng: linkedCrosswalk?.lng
      };
    }),

    ...faultyLeds.map(led => {
      const linkedCrosswalk = getLinkedCrosswalk(led.junctionId);

      return {
        ...led,
        itemType: 'led',
        title: `תאורת LED (${led.color})`,
        fault: 'תקלת תאורה',

        // Use the linked crosswalk location.
        lat: linkedCrosswalk?.lat,
        lng: linkedCrosswalk?.lng
      };
    })
  ];

  return (
    <div
      className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans"
      dir="rtl"
    >

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800 text-white p-4 md:p-6 flex flex-col md:justify-between shadow-xl z-20 shrink-0 md:h-full">

        <div>

          <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-8 text-center border-b border-slate-700 pb-4">
            SafeCross 🚦
          </h1>

          <nav className="flex flex-row md:flex-col gap-2 md:gap-3 text-slate-300 overflow-x-auto pb-2 md:pb-0 whitespace-nowrap">

            <button className="text-right text-white bg-slate-700 px-4 py-2 md:p-3 rounded font-medium transition shadow-sm border border-slate-600 flex items-center gap-2 text-sm md:text-base">
              🔧 קריאות שירות
            </button>

          </nav>

        </div>

        <div className="flex flex-row md:flex-col justify-between md:justify-start items-center md:items-stretch gap-3 mt-4 md:mt-0">

          <div className="bg-slate-700 px-3 py-2 md:p-3 rounded text-xs md:text-sm text-center border border-slate-600">
            👷‍♂️ טכנאי שטח
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded transition font-bold shadow-md text-sm md:text-base"
          >
            התנתק
          </button>

        </div>

      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 flex flex-col overflow-y-auto w-full">

        <header className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 shrink-0">

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800">
              ניהול תקלות חומרה
            </h2>

            <p className="text-sm md:text-base text-slate-500 mt-1">
              רשימת ציוד קצה הדורש התערבות בשטח
            </p>
          </div>

          <div className="bg-orange-100 px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-sm text-xs md:text-sm text-orange-800 border border-orange-200 font-bold flex items-center gap-2">
            <span>{allFaultyItems.length} תקלות פתוחות</span>
          </div>

        </header>

        <div className="flex flex-col gap-4 md:gap-6 flex-1">

          {/* Map */}
          {allFaultyItems.length > 0 && (

            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden h-48 md:h-64 shrink-0 flex flex-col">

              <div className="bg-slate-50 p-2 border-b border-slate-200 font-bold text-slate-700 text-xs md:text-sm">
                🗺️ פריסת תקלות גיאוגרפית
              </div>

              <div className="flex-1 relative z-0">

                <MapContainer
                  center={[32.016, 34.774]}
                  zoom={13}
                  style={{
                    height: '100%',
                    width: '100%'
                  }}
                >

                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />

                  {crosswalks.map((cw) => (

                    cw.lat &&
                    cw.lng &&
                    (cw.status === 'error' || cw.status === 'suspended')
                      ? (

                        <Marker
                          key={cw._id}
                          position={[cw.lat, cw.lng]}
                        >

                          <Popup>

                            <div
                              className="text-right font-sans"
                              dir="rtl"
                            >

                              <strong className="block text-red-600">
                                {cw.street
                                  ? `${cw.street}, ${cw.city}`
                                  : cw.city}
                              </strong>

                              <span className="text-xs text-gray-600">
                                מזהה: {cw._id}
                              </span>

                            </div>

                          </Popup>

                        </Marker>

                      )
                      : null

                  ))}

                </MapContainer>

              </div>

            </div>

          )}

          <div className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col flex-1 overflow-hidden">

            <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center text-sm md:text-base">

              <span>
                🛠️ סידור עבודה - רכיבים לתיקון
              </span>

            </div>

            {isLoading ? (

              <div className="flex flex-col items-center justify-center p-12">

                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-2">
                </div>

                <span className="text-slate-500 text-sm">
                  טוען קריאות שירות מהשרת...
                </span>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full text-right min-w-[700px]">

                  <thead className="bg-white border-b-2 border-slate-200 text-slate-500 text-sm">

                    <tr>

                      <th className="p-4 font-bold">
                        סוג רכיב / מיקום
                      </th>

                      <th className="p-4 font-bold">
                        מזהה מערכת
                      </th>

                      <th className="p-4 font-bold">
                        תיאור התקלה
                      </th>

                      <th className="p-4 font-bold text-center">
                        פעולות טכנאי
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {allFaultyItems.map((item) => (

                      <tr
                        key={item._id}
                        className="hover:bg-slate-50 transition"
                      >

                        <td className="p-4">

                          <div className="font-bold text-slate-800">
                            {item.title}
                          </div>

                        </td>

                        <td className="p-4 font-mono text-sm text-slate-600">
                          {item._id}
                        </td>

                        <td className="p-4">

                          <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded text-xs font-bold inline-block border border-red-200 whitespace-nowrap">

                            🔴 {item.fault}

                          </span>

                        </td>

                        <td className="p-4 text-center">

                          <div className="flex items-center justify-center gap-2">

                            {/* Waze navigation */}
                            {item.lat && item.lng && (

                              <a
                                href={`https://waze.com/ul?ll=${item.lat},${item.lng}&navigate=yes`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded text-xs font-bold border border-blue-200 transition inline-block whitespace-nowrap"
                              >

                                📍 נווט ב-Waze

                              </a>

                            )}

                            {/* Mark hardware as fixed */}
                            <button
                              onClick={() =>
                                handleFixHardware(
                                  item.itemType,
                                  item._id
                                )
                              }
                              className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow transition whitespace-nowrap"
                            >

                              ✅ דווח כתוקן

                            </button>

                          </div>

                        </td>

                      </tr>

                    ))}

                    {allFaultyItems.length === 0 && (

                      <tr>

                        <td
                          colSpan="4"
                          className="p-10 text-center text-slate-500 font-medium text-base md:text-lg"
                        >

                          🎉 אין תקלות חומרה פתוחות! כל המערכות תקינות.

                        </td>

                      </tr>

                    )}

                  </tbody>

                </table>

              </div>

            )}

          </div>

        </div>

      </main>

    </div>
  );
}

export default TechnicianDashboard;