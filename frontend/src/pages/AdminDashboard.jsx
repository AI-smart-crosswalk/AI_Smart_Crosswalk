import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io('http://localhost:5000'); 

function AdminDashboard() {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('users'); 
  const [infraSubTab, setInfraSubTab] = useState('junctions'); 

  const [users, setUsers] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const initialFormState = {
    name: '', username: '', password: '', email: '', phone: '', idNumber: '', address: '', role: 'Dispatcher'
  };
  const [formData, setFormData] = useState(initialFormState);

  const [junctions, setJunctions] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [leds, setLeds] = useState([]);
  const [infraSearchTerm, setInfraSearchTerm] = useState('');
  
  const [isInfraModalOpen, setIsInfraModalOpen] = useState(false);
  const [selectedInfraItem, setSelectedInfraItem] = useState(null);
  const [infraFormData, setInfraFormData] = useState({});
  const [isInfraEditMode, setIsInfraEditMode] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/');
          return;
        }

        const headers = { 'Authorization': `Bearer ${token}` };

        const [usersRes, crosswalksRes, camerasRes, ledsRes] = await Promise.all([
          fetch('/api/users', { headers }),
          fetch('/api/crosswalks', { headers }),
          fetch('/api/cameras', { headers }),
          fetch('/api/leds', { headers })
        ]);

        if (usersRes.ok) setUsers(await usersRes.json());
        if (crosswalksRes.ok) setJunctions(await crosswalksRes.json());
        if (camerasRes.ok) setCameras(await camerasRes.json());
        if (ledsRes.ok) setLeds(await ledsRes.json());
        
        setIsLoading(false);
      } catch (error) {
        console.error(error);
        alert("שגיאה בטעינת הנתונים, אנא בדוק חיבור לשרת.");
        setIsLoading(false);
      }
    };

    fetchAllData();
    
    socket.on('infra_added', (data) => {
      if (data.type === 'crosswalk') setJunctions(prev => prev.find(i => i._id === data.payload._id) ? prev : [...prev, data.payload]);
      if (data.type === 'camera') setCameras(prev => prev.find(i => i._id === data.payload._id) ? prev : [...prev, data.payload]);
      if (data.type === 'led') setLeds(prev => prev.find(i => i._id === data.payload._id) ? prev : [...prev, data.payload]);
    });

    socket.on('infra_updated', (data) => {
      if (data.type === 'crosswalk') setJunctions(prev => prev.map(j => j._id === data.payload._id ? data.payload : j));
      if (data.type === 'camera') setCameras(prev => prev.map(c => c._id === data.payload._id ? data.payload : c));
      if (data.type === 'led') setLeds(prev => prev.map(l => l._id === data.payload._id ? data.payload : l));
    });

    socket.on('user_added', (newUser) => {
      setUsers(prev => prev.find(u => u._id === newUser._id) ? prev : [...prev, newUser]);
    });

    socket.on('user_updated', (updatedUser) => {
      setUsers(prev => prev.map(u => u._id === updatedUser._id ? updatedUser : u));
      setSelectedUser(prev => (prev && prev._id === updatedUser._id) ? updatedUser : prev);
    });

    socket.on('user_deleted', (deletedUserId) => {
      setUsers(prev => prev.filter(u => u._id !== deletedUserId));
      setSelectedUser(prev => (prev && prev._id === deletedUserId) ? null : prev);
    });

    return () => {
      socket.off('infra_added');
      socket.off('infra_updated');
      socket.off('user_added');
      socket.off('user_updated');
      socket.off('user_deleted');
    };
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!formData.name.trim().includes(' ')) return alert('נא להזין שם מלא הכולל לפחות שתי שמות (שם פרטי ומשפחה)');

    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'שגיאה ביצירת משתמש');
      }

      const newUser = await response.json();
      setUsers(prev => prev.find(u => u._id === newUser._id) ? prev : [...prev, newUser]);
      setFormData(initialFormState);
      setIsModalOpen(false);
      alert('משתמש חדש נוצר בהצלחה!');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleUpdateUser = async (e) => {
      e.preventDefault();
      try {
        const response = await fetch(`/api/users/${selectedUser._id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            name: formData.name, email: formData.email, phone: formData.phone,
            idNumber: formData.idNumber, address: formData.address, role: formData.role
          })
        });

        if (!response.ok) throw new Error('שגיאה בעדכון משתמש');
        const updatedUser = await response.json();
        
        setUsers(users.map(u => u._id === updatedUser._id ? updatedUser : u));
        setSelectedUser(updatedUser);
        setIsEditMode(false);
        alert("הפרטים עודכנו בהצלחה!");
      } catch(error) {
        alert(error.message);
      }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const response = await fetch(`/api/users/${id}/status`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!response.ok) throw new Error('שגיאה בשינוי סטטוס');
      
      setUsers(users.map(user => user._id === id ? { ...user, status: newStatus } : user));
      if (selectedUser && selectedUser._id === id) setSelectedUser({...selectedUser, status: newStatus});
    } catch(error) {
      alert(error.message);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו בלתי הפיכה.')) return;
    try {
      const response = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (!response.ok) throw new Error('שגיאה במחיקת משתמש');
      
      setUsers(users.filter(user => user._id !== id));
      if (selectedUser && selectedUser._id === id) handleCloseProfile();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleUserClick = (user) => { setSelectedUser(user); setIsEditMode(false); };
  const handleCloseProfile = () => { setSelectedUser(null); setIsEditMode(false); setFormData(initialFormState); };
  const handleEditClick = () => {
      setFormData({
          name: selectedUser.name || '', username: selectedUser.username || '', password: '',
          email: selectedUser.email || '', phone: selectedUser.phone || '', idNumber: selectedUser.idNumber || '',
          address: selectedUser.address || '', role: selectedUser.role || 'Dispatcher'
      });
      setIsEditMode(true);
  };

  const getRoleBadge = (role) => {
    const roles = {
      Admin: 'bg-purple-100 text-purple-800 border-purple-200', Manager: 'bg-blue-100 text-blue-800 border-blue-200',
      Dispatcher: 'bg-slate-100 text-slate-800 border-slate-200', Technician: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return <span className={`px-2 py-1 rounded text-xs font-bold border whitespace-nowrap ${roles[role] || 'bg-gray-100 text-gray-800'}`}>{role}</span>;
  };

  const handleCreateInfraClick = () => {
    setInfraFormData({ status: 'active', type: 'LPR (זיהוי לוחיות)', color: 'אדום' }); 
    setIsInfraEditMode(false);
    setIsInfraModalOpen(true);
  };

  const handleEditInfraClick = (item) => {
    setSelectedInfraItem(item);
    setInfraFormData({ ...item });
    setIsInfraEditMode(true);
    setIsInfraModalOpen(true);
  };

  const handleSaveInfraUpdate = async (e) => {
    e.preventDefault();
    try {
      let endpoint = '';
      if (infraSubTab === 'junctions') endpoint = '/api/crosswalks';
      if (infraSubTab === 'cameras') endpoint = '/api/cameras';
      if (infraSubTab === 'leds') endpoint = '/api/leds';

      const method = isInfraEditMode ? 'PUT' : 'POST';
      const url = isInfraEditMode ? `${endpoint}/${infraFormData._id}` : endpoint;

      const response = await fetch(url, {
        method: method,
        headers: getHeaders(),
        body: JSON.stringify(infraFormData)
      });

      if (!response.ok) throw new Error('שגיאה בשמירת הנתונים בשרת');
      const savedData = await response.json();

      if (isInfraEditMode) {
        if (infraSubTab === 'junctions') setJunctions(junctions.map(j => j._id === savedData._id ? savedData : j));
        else if (infraSubTab === 'cameras') setCameras(cameras.map(c => c._id === savedData._id ? savedData : c));
        else if (infraSubTab === 'leds') setLeds(leds.map(l => l._id === savedData._id ? savedData : l));
        alert('השינויים נשמרו בהצלחה!');
      } else {
        if (infraSubTab === 'junctions') setJunctions([...junctions, savedData]);
        else if (infraSubTab === 'cameras') setCameras([...cameras, savedData]);
        else if (infraSubTab === 'leds') setLeds([...leds, savedData]);
        alert('הפריט החדש נוצר בהצלחה!');
      }
      setIsInfraModalOpen(false);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleGeocodeAddress = async () => {
    const city = infraFormData.city || "";
    const street = infraFormData.street || "";

    if (city.trim() === '') return alert('חובה להזין לפחות עיר/יישוב כדי לבצע חיפוש.');

    setIsGeocoding(true);
    try {
      let apiUrl = `https://nominatim.openstreetmap.org/search?format=json&country=israel&limit=1`;
      if (city) apiUrl += `&city=${encodeURIComponent(city)}`;
      if (street) apiUrl += `&street=${encodeURIComponent(street)}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data && data.length > 0) {
        setInfraFormData({
          ...infraFormData,
          lat: data[0].lat.substring(0, 8),
          lng: data[0].lon.substring(0, 8)
        });
      } else {
        alert('לא מצאנו את המיקום המדויק.\nטיפ: נסה לפשט את שם הרחוב, או להדביק קואורדינטות ישירות מגוגל מפות.');
      }
    } catch (error) {
      alert('שגיאה בתקשורת מול שרת המפות.');
    }
    setIsGeocoding(false);
  };

  const renderStatusBadge = (status) => {
    if (status === 'active') return <span className="text-green-700 font-bold text-xs bg-green-100 px-2 py-1 rounded border border-green-300">פעיל תקין</span>;
    if (status === 'error') return <span className="text-red-700 font-bold text-xs bg-red-100 px-2 py-1 rounded border border-red-300">תקלה ⚠️</span>;
    if (status === 'suspended') return <span className="text-orange-700 font-bold text-xs bg-orange-100 px-2 py-1 rounded border border-orange-300">מושבת יזום 🛑</span>;
    return null;
  };

  const renderUsersManagement = () => {
    const filteredUsers = users.filter(user => 
      (user.name && user.name.includes(userSearchTerm)) || 
      (user.username && user.username.includes(userSearchTerm)) ||
      (user._id && user._id.includes(userSearchTerm)) ||
      (user.email && user.email.includes(userSearchTerm))
    );

    return (
      <div className="flex flex-col gap-4 md:gap-6 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 shrink-0 mb-2 md:mb-4">
            <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-slate-500 text-xs md:text-sm font-bold mb-1">סה"כ משתמשים רשומים</div>
                  <div className="text-2xl md:text-3xl font-black text-slate-800">{users.length}</div>
                </div>
                <div className="text-3xl md:text-4xl opacity-20">👥</div>
            </div>
            <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-slate-500 text-xs md:text-sm font-bold mb-1">משתמשים פעילים</div>
                  <div className="text-2xl md:text-3xl font-black text-green-600">
                      {users.filter(u => u.status === 'active').length}
                  </div>
                </div>
                <div className="text-3xl md:text-4xl opacity-20">✅</div>
            </div>
            <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-slate-500 text-xs md:text-sm font-bold mb-1">משתמשים מושהים</div>
                  <div className="text-2xl md:text-3xl font-black text-red-500">
                      {users.filter(u => u.status === 'suspended').length}
                  </div>
                </div>
                <div className="text-3xl md:text-4xl opacity-20">🔒</div>
            </div>
        </div>

        <header className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800">ניהול משתמשים</h2>
            <p className="text-sm text-slate-500 mt-1">צפייה, יצירה ועריכת הרשאות משתמשי מערכת</p>
          </div>
          <button onClick={() => { setFormData(initialFormState); setIsModalOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition">
            + הוסף משתמש חדש
          </button>
        </header>

        <div className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col flex-1 overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <span>רשימת משתמשים והרשאות</span>
                <input 
                    type="text" placeholder="חיפוש משתמש, ת.ז או מזהה..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="p-2 px-3 border border-slate-300 rounded text-sm outline-none focus:border-purple-500 w-full sm:w-64 font-normal"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[800px]">
                    <thead className="bg-white border-b-2 border-slate-200 text-slate-500 text-sm">
                        <tr>
                            <th className="p-4 font-bold">מזהה</th>
                            <th className="p-4 font-bold">שם מלא</th>
                            <th className="p-4 font-bold">שם משתמש</th>
                            <th className="p-4 font-bold">אימייל</th>
                            <th className="p-4 font-bold">תפקיד</th>
                            <th className="p-4 font-bold">סטטוס</th>
                            <th className="p-4 font-bold text-center">פעולות אדמין</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredUsers.map((user) => {
                            const userId = user._id;
                            return (
                            <tr key={userId} className={`hover:bg-slate-100 transition ${user.status === 'suspended' ? 'bg-red-50/30' : ''}`}>
                                <td className="p-4 font-mono text-sm text-slate-500">{userId ? userId.substring(0, 8) + '...' : ''}</td>
                                <td className="p-4 font-bold text-blue-600 cursor-pointer hover:underline" onClick={() => handleUserClick(user)}>{user.name}</td>
                                <td className="p-4 text-slate-600 font-mono text-sm">{user.username}</td>
                                <td className="p-4 text-slate-500 text-sm">{user.email || '-'}</td>
                                <td className="p-4">{getRoleBadge(user.role)}</td>
                                <td className="p-4">
                                    {user.status === 'active' ? <span className="text-green-600 font-bold text-xs flex items-center gap-1 whitespace-nowrap">🟢 פעיל</span> : <span className="text-red-500 font-bold text-xs flex items-center gap-1 whitespace-nowrap">🔴 מושהה</span>}
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-3 text-sm">
                                        <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(userId, user.status); }} className={`${user.status === 'active' ? 'text-orange-500' : 'text-green-600'} font-bold transition whitespace-nowrap`}>
                                            {user.status === 'active' ? 'השהה' : 'הפעל'}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(userId); }} className="text-red-600 font-bold transition">מחק</button>
                                    </div>
                                </td>
                            </tr>
                        )})}
                        {filteredUsers.length === 0 && (
                            <tr><td colSpan="7" className="p-8 text-center text-slate-500">לא נמצאו משתמשים התואמים לחיפוש.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    );
  };

  const renderInfrastructureManagement = () => {
    let currentData = [];
    if (infraSubTab === 'junctions') currentData = junctions;
    if (infraSubTab === 'cameras') currentData = cameras;
    if (infraSubTab === 'leds') currentData = leds;

    const filteredData = currentData.filter(item => 
      (item.name && item.name.includes(infraSearchTerm)) || (item._id && item._id.includes(infraSearchTerm))
    );

    return (
      <div className="flex flex-col gap-4 flex-1">
        <header className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800">ניהול תשתיות חומרה</h2>
            <p className="text-sm text-slate-500 mt-1">הוספה, עריכה ומעקב אחר צמתים, מצלמות ותאורת לד</p>
          </div>
          <button onClick={handleCreateInfraClick} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition">
            + הוסף {infraSubTab === 'junctions' ? 'צומת' : infraSubTab === 'cameras' ? 'מצלמה' : 'LED'} חדש
          </button>
        </header>

        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto">
          <button onClick={() => setInfraSubTab('junctions')} className={`px-4 py-2 rounded-md font-bold text-sm transition whitespace-nowrap ${infraSubTab === 'junctions' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}>🚦 צמתים</button>
          <button onClick={() => setInfraSubTab('cameras')} className={`px-4 py-2 rounded-md font-bold text-sm transition whitespace-nowrap ${infraSubTab === 'cameras' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}>📷 מצלמות</button>
          <button onClick={() => setInfraSubTab('leds')} className={`px-4 py-2 rounded-md font-bold text-sm transition whitespace-nowrap ${infraSubTab === 'leds' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}>💡 תאורת LED</button>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mt-2 flex-1">
           <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <span className="font-bold text-slate-700">רשימת ציוד מעודכנת</span>
              <input type="text" placeholder="חיפוש לפי שם או מזהה..." value={infraSearchTerm} onChange={(e) => setInfraSearchTerm(e.target.value)} className="p-2 px-3 border border-slate-300 rounded text-sm w-full sm:w-64 outline-none focus:border-blue-500" />
           </div>
           
           <div className="overflow-x-auto">
              <table className="w-full text-right min-w-[700px]">
                 <thead className="bg-white border-b-2 border-slate-200 text-slate-500 text-sm">
                    <tr>
                       <th className="p-4 font-bold">מזהה (ID)</th>
                       <th className="p-4 font-bold">שם / מיקום</th>
                       <th className="p-4 font-bold">פרטים נוספים</th>
                       <th className="p-4 font-bold">סטטוס</th>
                       <th className="p-4 font-bold text-center">פעולות</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {filteredData.map(item => (
                      <tr key={item._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono text-sm text-slate-500">{item._id ? item._id.substring(0, 8) + '...' : ''}</td>
                        <td className="p-4 font-bold text-slate-700">{item.name}</td>
                        <td className="p-4 text-sm text-slate-600">
                           {infraSubTab === 'junctions' && `כתובת: ${item.street ? item.street + ', ' : ''}${item.city} | ${item.lat || ''},${item.lng || ''}`}
                           {infraSubTab === 'cameras' && `IP: ${item.ip} | סוג: ${item.type}`}
                           {infraSubTab === 'leds' && `צבע: ${item.color}`}
                        </td>
                        <td className="p-4">{renderStatusBadge(item.status)}</td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleEditInfraClick(item)} className="text-blue-600 hover:text-blue-800 font-bold text-sm mx-2 transition">
                            ערוך ✏️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredData.length === 0 && (
                      <tr><td colSpan="5" className="p-8 text-center text-slate-500">לא נמצאו רשומות.</td></tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans" dir="rtl">
      
      <aside className="w-full md:w-64 bg-slate-900 text-white p-4 md:p-6 flex flex-col md:justify-between shadow-2xl z-20 shrink-0 md:h-full overflow-y-auto">
        <div>
          <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-8 text-center border-b border-slate-700 pb-4 text-purple-400">
            SafeCross Core ⚙️
          </h1>
          <nav className="flex flex-col gap-2 text-slate-300">
            <button onClick={() => setActiveTab('users')} className={`text-right px-4 py-3 rounded font-medium transition border ${activeTab === 'users' ? 'bg-slate-800 border-slate-700 text-white shadow-sm' : 'border-transparent hover:bg-slate-800/50'}`}>
              👥 ניהול משתמשים
            </button>
            <button onClick={() => setActiveTab('infrastructure')} className={`text-right px-4 py-3 rounded font-medium transition border ${activeTab === 'infrastructure' ? 'bg-slate-800 border-slate-700 text-white shadow-sm' : 'border-transparent hover:bg-slate-800/50'}`}>
              🚦 ניהול תשתיות חומרה
            </button>
          </nav>
        </div>
        
        <div className="flex flex-col gap-3 mt-8">
            <div className="bg-slate-800 px-3 py-3 rounded text-sm text-center border border-slate-700 text-purple-300">👑 מחובר כאדמין</div>
            <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition font-bold shadow-md">התנתק</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 flex flex-col overflow-y-auto w-full relative">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-purple-600 rounded-full animate-spin mb-3"></div>
            <span className="text-slate-500 font-medium">מתחבר לשרת ומושך נתונים...</span>
          </div>
        ) : (
          activeTab === 'users' ? renderUsersManagement() : renderInfrastructureManagement()
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-xl font-bold text-slate-800">👤 יצירת משתמש חדש</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-lg transition">✕</button>
            </div>
            <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">שם מלא *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500" required />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">שם משתמש *</label>
                <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500 font-mono" required />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">סיסמה *</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500 font-mono" required />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">ת.ז</label>
                <input type="text" value={formData.idNumber} onChange={(e) => setFormData({...formData, idNumber: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">מספר טלפון</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500" dir="ltr" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">אימייל</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500" dir="ltr" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">תפקיד *</label>
                <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-purple-500 bg-white">
                  <option value="Dispatcher">מוקדן (Dispatcher)</option>
                  <option value="Manager">מנהל אזור (Manager)</option>
                  <option value="Technician">טכנאי (Technician)</option>
                  <option value="Admin">אדמין (Admin)</option>
                </select>
              </div>
              <div className="col-span-2 flex justify-end gap-3 mt-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50">ביטול</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow">צור משתמש</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-3">
                 <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {isEditMode ? '✏️ עריכת פרופיל משתמש' : '🪪 כרטיסיית משתמש'}
                 </h3>
                 <button onClick={handleCloseProfile} className="text-slate-400 hover:text-red-500 font-bold text-lg">✕</button>
              </div>

              {isEditMode ? (
                  <form onSubmit={handleUpdateUser} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500">שם מלא</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" required />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500">שם משתמש (לא ניתן לעריכה)</label>
                            <input type="text" value={formData.username} disabled className="w-full p-2 border rounded bg-slate-100 text-slate-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500">תפקיד</label>
                            <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-2 border rounded">
                                <option value="Dispatcher">מוקדן</option>
                                <option value="Manager">מנהל אזור</option>
                                <option value="Technician">טכנאי</option>
                                <option value="Admin">אדמין</option>
                            </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500">ת.ז</label>
                            <input type="text" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500">טלפון</label>
                            <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded" dir="ltr" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500">אימייל</label>
                        <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 border rounded" dir="ltr" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500">כתובת</label>
                        <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2 border rounded" />
                      </div>
                      <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                          <button type="button" onClick={() => setIsEditMode(false)} className="px-4 py-2 border rounded font-bold text-slate-600">ביטול</button>
                          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-bold">שמור שינויים</button>
                      </div>
                  </form>
              ) : (
                  <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="w-16 h-16 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-2xl font-bold">
                              {selectedUser.name.charAt(0)}
                          </div>
                          <div>
                              <h4 className="text-xl font-bold text-slate-800">{selectedUser.name}</h4>
                              <p className="text-slate-500 font-mono text-sm">@{selectedUser.username}</p>
                          </div>
                          <div className="mr-auto">
                              {getRoleBadge(selectedUser.role)}
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6 p-2">
                          <div>
                              <span className="block text-xs font-bold text-slate-400 mb-1">תעודת זהות</span>
                              <span className="text-slate-700">{selectedUser.idNumber || 'לא הוזן'}</span>
                          </div>
                          <div>
                              <span className="block text-xs font-bold text-slate-400 mb-1">מספר טלפון</span>
                              <span className="text-slate-700" dir="ltr">{selectedUser.phone || 'לא הוזן'}</span>
                          </div>
                          <div>
                              <span className="block text-xs font-bold text-slate-400 mb-1">כתובת אימייל</span>
                              <span className="text-slate-700" dir="ltr">{selectedUser.email || 'לא הוזן'}</span>
                          </div>
                          <div>
                              <span className="block text-xs font-bold text-slate-400 mb-1">כתובת מגורים</span>
                              <span className="text-slate-700">{selectedUser.address || 'לא הוזן'}</span>
                          </div>
                      </div>
                      <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                          <span className="text-xs text-slate-400">
                              סטטוס: {selectedUser.status === 'active' ? 'פעיל' : 'מושהה'}
                          </span>
                          <button onClick={handleEditClick} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded shadow text-sm font-bold flex gap-2 items-center">
                              ערוך פרטים ✏️
                          </button>
                      </div>
                  </div>
              )}
           </div>
        </div>
      )}

      {isInfraModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-xl font-bold text-slate-800">
                {isInfraEditMode ? '🔧 עריכת' : '✨ יצירת'} {infraSubTab === 'junctions' ? 'צומת' : infraSubTab === 'cameras' ? 'מצלמה' : 'תאורת LED'}
              </h3>
              <button onClick={() => setIsInfraModalOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveInfraUpdate} className="flex flex-col gap-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">שם / תיאור</label>
                  <input type="text" value={infraFormData.name || ''} onChange={(e) => setInfraFormData({...infraFormData, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">סטטוס תפעולי</label>
                  <select value={infraFormData.status || 'active'} onChange={(e) => setInfraFormData({...infraFormData, status: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white">
                    <option value="active">פעיל ותקין</option>
                    <option value="error">תקלה (Error)</option>
                    <option value="suspended">מושבת יזום (Suspended)</option>
                  </select>
                </div>
              </div>

              {infraSubTab === 'junctions' && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">עיר / יישוב *</label>
                      <input 
                        type="text" 
                        value={infraFormData.city || ''} 
                        onChange={(e) => setInfraFormData({...infraFormData, city: e.target.value})} 
                        placeholder="למשל: יגל" 
                        className="w-full p-2 border border-slate-300 rounded text-sm" 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">רחוב / מיקום מדויק</label>
                      <input 
                        type="text" 
                        value={infraFormData.street || ''} 
                        onChange={(e) => setInfraFormData({...infraFormData, street: e.target.value})} 
                        placeholder="למשל: הלימון 5" 
                        className="w-full p-2 border border-slate-300 rounded text-sm" 
                      />
                    </div>
                  </div>

                  <div className="mb-4 flex justify-end">
                      <button 
                        type="button" 
                        onClick={handleGeocodeAddress} 
                        disabled={isGeocoding} 
                        className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2 w-full justify-center"
                      >
                        {isGeocoding ? 'מחפש מיקום מדויק...' : '📍 איתור קואורדינטות אוטומטי לפי הכתובת'}
                      </button>
                  </div>

                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                    <p className="text-xs text-blue-800 font-bold mb-2">
                      קואורדינטות לניווט טכנאי (Lat/Lng):
                      <span className="font-normal block mt-1">אותר אוטומטית, או הדבק ידנית</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">קו רוחב (Latitude)</label>
                        <input type="text" value={infraFormData.lat || ''} onChange={(e) => setInfraFormData({...infraFormData, lat: e.target.value})} placeholder="32.0734" className="w-full p-2 border border-blue-200 rounded text-sm text-left bg-white font-mono" dir="ltr" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">קו אורך (Longitude)</label>
                        <input type="text" value={infraFormData.lng || ''} onChange={(e) => setInfraFormData({...infraFormData, lng: e.target.value})} placeholder="34.7842" className="w-full p-2 border border-blue-200 rounded text-sm text-left bg-white font-mono" dir="ltr" required />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {infraSubTab === 'cameras' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">כתובת IP (רשת)</label>
                      <input type="text" value={infraFormData.ip || ''} onChange={(e) => setInfraFormData({...infraFormData, ip: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm text-left font-mono" dir="ltr" required />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">סוג מצלמה</label>
                      <select value={infraFormData.type || 'LPR (זיהוי לוחיות)'} onChange={(e) => setInfraFormData({...infraFormData, type: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="LPR (זיהוי לוחיות)">LPR (זיהוי לוחיות)</option>
                        <option value="PTZ (ממונעת)">PTZ (ממונעת)</option>
                        <option value="Thermal (תרמית)">Thermal (תרמית)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">שיוך לצומת *</label>
                    <select value={infraFormData.junctionId || ''} onChange={(e) => setInfraFormData({...infraFormData, junctionId: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm bg-white" required>
                      <option value="" disabled>בחר צומת...</option>
                      {junctions.map(j => (
                        <option key={j._id} value={j._id}>{j.name} ({j.city})</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {infraSubTab === 'leds' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">צבע תאורה</label>
                      <select value={infraFormData.color || 'אדום'} onChange={(e) => setInfraFormData({...infraFormData, color: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="אדום">אדום</option>
                        <option value="ירוק">ירוק</option>
                        <option value="כתום">כתום</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">שיוך לצומת *</label>
                      <select value={infraFormData.junctionId || ''} onChange={(e) => setInfraFormData({...infraFormData, junctionId: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm bg-white" required>
                        <option value="" disabled>בחר צומת...</option>
                        {junctions.map(j => (
                          <option key={j._id} value={j._id}>{j.name} ({j.city})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsInfraModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50">ביטול</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow">
                  {isInfraEditMode ? 'שמור שינויים' : 'צור פריט חדש'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;