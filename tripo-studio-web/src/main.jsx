import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Sparkles, ImagePlus, Download, History, CreditCard, LogIn, LogOut, LoaderCircle, LockKeyhole, ArrowUpRight, CheckCircle2, Menu, X } from 'lucide-react';
import { supabase, supabaseReady } from './lib/supabase';
import './styles.css';

const prompts = [
  'A sculptural ceramic lamp inspired by ocean waves, matte ivory glaze, soft rounded silhouette',
  'A friendly retro-futuristic desk robot, brushed aluminium body, amber glass eyes',
  'A tiny fantasy treehouse with curved timber beams and a mossy roof',
  'A sleek electric concept motorcycle, satin graphite bodywork, copper accents'
];
const formats = ['GLB', 'STL', 'OBJ', 'USDZ'];
const API = '/api';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('studio');
  const [mode, setMode] = useState('text');
  const [prompt, setPrompt] = useState(prompts[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [model, setModel] = useState('v3.1-20260211');
  const [taskId, setTaskId] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState(null);
  const [history, setHistory] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('GLB');
  const [exportBusy, setExportBusy] = useState(false);
  const token = session?.access_token;
  const freeUsed = profile?.plan === 'free' && profile?.free_generation_used;

  async function refreshProfile(user = session?.user) {
    if (!user || !supabase) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('display_name,credits,plan,free_generation_used').eq('id', user.id).maybeSingle();
    setProfile(data || { display_name: user.user_metadata?.full_name || user.email, credits: 1, plan: 'free', free_generation_used: false });
  }
  async function refreshHistory() {
    if (!session?.user || !supabase) return;
    const { data } = await supabase.from('generations').select('id,task_id,mode,prompt,status,progress,model_url,preview_url,created_at,model_version').order('created_at', { ascending: false }).limit(50);
    setHistory(data || []);
  }
  useEffect(() => {
    if (!supabaseReady) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session?.user) refreshProfile(data.session.user); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) setTimeout(() => refreshProfile(next.user), 0);
      else { setProfile(null); setHistory([]); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session?.user) { refreshProfile(session.user); refreshHistory(); } }, [session]);
  useEffect(() => {
    if (!taskId || !busy || !token) return;
    let cancelled = false, timer;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/tasks/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not check generation status.');
        if (cancelled) return;
        setProgress(data.progress || (data.status === 'success' ? 100 : 12)); setStatus(data.status);
        if (data.output) setOutput(data.output);
        if (data.status === 'success') { setBusy(false); setProgress(100); refreshProfile(); refreshHistory(); return; }
        if (['failed','cancelled','banned'].includes(data.status)) { setBusy(false); setError(data.error || 'Generation failed. Credit refunded when applicable.'); refreshProfile(); refreshHistory(); return; }
        timer = setTimeout(poll, 2500);
      } catch (e) { if (!cancelled) { setBusy(false); setError(e.message); } }
    };
    timer = setTimeout(poll, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [taskId, busy, token]);

  async function authenticate(e) {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (!supabaseReady) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      if (authMode === 'signup') {
        const { data, error: e1 } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (e1) throw e1;
        if (!data.session) setMessage('Account created. Check your email to confirm your address, then sign in.');
        else setAuthOpen(false);
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email, password });
        if (e1) throw e1; setAuthOpen(false);
      }
    } catch (e) { setError(e.message || 'Authentication failed.'); }
    finally { setBusy(false); }
  }
  async function generate() {
    setError(''); setOutput(null);
    if (!supabaseReady) { setError('Configure Supabase first in Vercel environment variables.'); return; }
    if (!session) { setAuthMode('signup'); setAuthOpen(true); return; }
    if (freeUsed) { setError('Your one free model has been used. Choose a paid plan to generate more models.'); setView('plans'); return; }
    if (mode === 'text' && prompt.trim().length < 3) { setError('Please enter a more descriptive prompt.'); return; }
    if (mode === 'image' && !imageUrl.trim()) { setError('Enter a public HTTPS image URL to generate from.'); return; }
    setBusy(true); setProgress(4); setStatus('queued'); setTaskId('');
    try {
      const res = await fetch(`${API}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ mode, prompt, imageUrl, model }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not start generation.');
      setTaskId(data.taskId); setProfile(p => p ? { ...p, credits: data.creditsRemaining, ...(data.plan === 'free' ? { free_generation_used: true } : {}) } : p);
    } catch (e) { setBusy(false); setStatus('failed'); setError(e.message); }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function exportModel(fmt = format, url = output?.modelUrl) {
    setError('');
    if (!profile || profile.plan === 'free') { setError('Downloads are available on paid plans.'); setView('plans'); return; }
    if (!url) { setError('No completed model is available to export.'); return; }
    setExportBusy(true);
    try {
      if (fmt === 'GLB') {
        const r = await fetch(url); if (!r.ok) throw new Error('Could not download the GLB file.'); downloadBlob(await r.blob(), 'AS3D-model.glb'); return;
      }
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const buffer = await (await fetch(url)).arrayBuffer();
      const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
      const scene = gltf.scene; scene.updateMatrixWorld(true);
      let blob;
      if (fmt === 'OBJ') { const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js'); blob = new Blob([new OBJExporter().parse(scene)], { type: 'text/plain;charset=utf-8' }); }
      else if (fmt === 'STL') { const { STLExporter } = await import('three/addons/exporters/STLExporter.js'); scene.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); }); blob = new Blob([new STLExporter().parse(scene, { binary: true })], { type: 'model/stl' }); }
      else if (fmt === 'USDZ') { const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js'); blob = new Blob([await new USDZExporter().parseAsync(scene)], { type: 'model/vnd.usdz+zip' }); }
      else throw new Error('Unsupported export format.');
      downloadBlob(blob, `AS3D-model.${fmt.toLowerCase()}`);
    } catch (e) { setError(/fetch|cors|network|load/i.test(e.message) ? 'The source model may block browser conversion via CORS. Try GLB or configure an allowlisted server-side proxy.' : e.message); }
    finally { setExportBusy(false); }
  }
  function openHistory(item) {
    if (profile?.plan === 'free') { setError('Upgrade to download. Free accounts can generate one model and preview only.'); return; }
    setOutput({ modelUrl: item.model_url, previewUrl: item.preview_url }); setView('studio');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('studio')}><span className="brand-mark"><Box size={21}/></span><span>AS<span>3D</span><small>AI MODEL STUDIO</small></span></button>
      <div className="side-label">WORKSPACE</div>
      <button className={view==='studio'?'nav-item active':'nav-item'} onClick={() => setView('studio')}><Sparkles size={17}/> Studio <span className="nav-pill">NEW</span></button>
      <button className={view==='models'?'nav-item active':'nav-item'} onClick={() => setView('models')}><Box size={17}/> My models</button>
      <button className={view==='history'?'nav-item active':'nav-item'} onClick={() => setView('history')}><History size={17}/> History</button>
      <div className="side-label side-gap">ACCOUNT</div>
      <button className={view==='plans'?'nav-item active':'nav-item'} onClick={() => setView('plans')}><CreditCard size={17}/> Plans & credits</button>
      <div className="sidebar-bottom">
        <div className="plan-box"><div className="plan-dot"/><div><b>{profile?.plan ? profile.plan.toUpperCase()+' PLAN' : 'FREE PLAN'}</b><small>{profile?.plan==='free' ? (freeUsed?'Free generation used':'1 free model') : `${profile?.credits ?? 0} credits remaining`}</small></div></div>
        {session ? <button className="account-button" onClick={() => supabase.auth.signOut()}><span className="avatar">{(profile?.display_name || session.user.email || 'A').slice(0,1).toUpperCase()}</span><span className="account-copy"><b>{profile?.display_name || session.user.email}</b><small>Sign out</small></span><LogOut size={15}/></button> : <button className="account-button" onClick={() => {setAuthMode('signin');setAuthOpen(true);}}><span className="avatar">A</span><span className="account-copy"><b>Guest creator</b><small>Sign in to sync</small></span><LogIn size={15}/></button>}
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Box size={20}/></span> AS3D</div><div className="crumb">Workspace <span>/</span> <b>{view==='studio'?'3D Studio':view==='models'?'My models':view==='history'?'History':'Plans & credits'}</b></div><div className="top-actions"><span className="secure-tag"><CheckCircle2 size={13}/> PRIVATE WORKSPACE</span>{session ? <button className="avatar top-avatar" onClick={() => setView('plans')}>{(profile?.display_name || session.user.email || 'A').slice(0,1).toUpperCase()}</button> : <button className="signin-btn" onClick={() => {setAuthMode('signin');setAuthOpen(true);}}><LogIn size={15}/> Sign in</button>}</div></header>
      <div className="content">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
        {view==='studio' && <>
          <section className="welcome-row"><div><div className="eyebrow"><i/> AI-POWERED 3D CREATION</div><h1>Make it <em>real.</em></h1><p className="subtitle">Turn a simple idea or image into a 3D model, ready to explore.</p></div><div className="welcome-stat"><span>CREATION ENGINE</span><b><i/> TRIPO AI</b><small>Text + image to 3D</small></div></section>
          <div className="studio-grid"><section className="panel prompt-panel"><div className="panel-head"><div><span className="step">01</span><div><h2>Describe your model</h2><p>Start with an idea. Refine the details.</p></div></div><span className="subtle-tag">AI GENERATOR</span></div>
            <div className="mode-switch"><button className={mode==='text'?'selected':''} onClick={() => setMode('text')}><Sparkles size={15}/> Text to 3D</button><button className={mode==='image'?'selected':''} onClick={() => setMode('image')}><ImagePlus size={15}/> Image to 3D</button></div>
            {mode==='text' ? <label className="field-label">YOUR PROMPT<textarea rows="6" value={prompt} maxLength={1500} onChange={e => setPrompt(e.target.value)} placeholder="Describe shape, material, color, details..."/></label> : <label className="field-label">IMAGE URL<input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://.../reference.png"/><small>Use a public HTTPS image URL for now.</small></label>}
            <div className="field-row"><label className="field-label">MODEL VERSION<select value={model} onChange={e => setModel(e.target.value)}><option value="v3.1-20260211">Tripo v3.1</option><option value="P2-20260801">Tripo P2</option><option value="v3.0-20260909">Tripo v3.0</option></select></label><div className="field-label">OUTPUT FORMAT<div className="format-row">{formats.map(f => <button key={f} className={format===f?'format-selected':''} onClick={() => setFormat(f)}>{f}</button>)}</div></div></div>
            <div className="generation-meta"><span><LockKeyhole size={13}/> {profile?.plan==='free'?'Preview free, export paid':'Export formats available'}</span><span>{profile?.plan==='free'?'1 free generation':'1 credit per generation'}</span></div>
            <button className="primary-button" disabled={busy} onClick={generate}>{busy?<><LoaderCircle className="spin" size={17}/> Generating model…</>:<><Sparkles size={17}/> Generate 3D model <ArrowUpRight size={16}/></>}</button>
            <p className="fine-print">Generation uses Tripo AI API credits. Please confirm commercial API permission before launch.</p>
          </section>
          <section className="panel preview-panel"><div className="panel-head preview-head"><div><span className="step">02</span><div><h2>3D preview</h2><p>{busy?'Generation in progress':output?.modelUrl?'Your model is ready':'Your model will appear here'}</p></div></div><span className={output?.modelUrl?'status-ready':'subtle-tag'}>{output?.modelUrl?'READY':'LIVE CANVAS'}</span></div>
            <div className="canvas">{output?.modelUrl ? <model-viewer src={output.modelUrl} poster={output.previewUrl || undefined} camera-controls auto-rotate shadow-intensity="1" exposure="1" ar style={{width:'100%',height:'100%',background:'transparent'}}></model-viewer> : busy ? <div className="loading-state"><div className="spinner-large"><LoaderCircle size={30}/></div><h3>Building your model<span className="pulse">...</span></h3><p>Tripo is shaping geometry and materials.</p><div className="progress"><span style={{width:`${Math.max(5,progress)}%`}}/></div><small>{status} · {progress}%</small></div> : <div className="empty-canvas"><div className="grid-floor"/><div className="wire-cube"><span/><span/><span/><span/><span/><span/></div><div className="canvas-copy"><span>YOUR CANVAS IS READY</span><h3>Something great<br/>starts with an idea.</h3><p>Generate a model to rotate, inspect, and export.</p></div></div>}</div>
            <div className="preview-footer"><span><i className={busy?'working':output?.modelUrl?'ready':''}/> {busy?'Working on your request':output?.modelUrl?'Generation complete':'Waiting for your first creation'}</span><span>{output?.modelUrl?'GLB · STL · OBJ · USDZ':'GLB · STL · OBJ · USDZ'}</span></div>
            {output?.modelUrl && <div className="download-controls"><div className="format-row">{formats.map(f => <button key={f} className={format===f?'format-selected':''} disabled={exportBusy} onClick={() => setFormat(f)}>{f}</button>)}</div><button className="secondary-button" disabled={exportBusy} onClick={() => exportModel()}>{exportBusy?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>} Download {format}</button></div>}
          </section></div>
          <div className="example-section"><div className="section-title"><span>START WITH A SPARK</span><small>Prompt ideas</small></div><div className="prompt-examples">{prompts.slice(1).map((p,i)=><button key={p} onClick={()=>{setPrompt(p);setMode('text')}}><span className={`example-art art-${i}`}><Box size={21}/></span><span>{p}</span><ArrowUpRight size={14}/></button>)}</div></div>
          <div className="tip-strip"><Sparkles size={18}/><div><b>Good models start with clear direction.</b><p>Describe the silhouette, material, and mood. One focused subject usually gives the best result.</p></div><button onClick={()=>setPrompt('A minimal sculptural vase, translucent sea-glass material, asymmetric organic curves, isolated product design')}>Improve prompt ↗</button></div>
        </>}
        {(view==='models'||view==='history') && <section className="library"><div className="eyebrow"><i/> YOUR LIBRARY</div><h1>{view==='models'?'Your 3D library.':'Generation history.'}</h1><p className="subtitle">Your generations, statuses, and model links in one place.</p>{!session?<div className="empty-library"><Box size={30}/><h3>Sign in to sync your creations.</h3><button className="primary-button" onClick={()=>{setAuthMode('signin');setAuthOpen(true)}}>Sign in</button></div>:history.length?<div className="history-table">{history.filter(x=>view==='history'||x.status==='success').map(item=><div className="history-row" key={item.id}><div className="history-thumb">{item.preview_url?<img src={item.preview_url} alt=""/>:<Box size={22}/>}</div><div className="history-details"><b>{item.prompt||'Image-to-3D model'}</b><small>{item.mode} · {new Date(item.created_at).toLocaleString()}</small></div><span className="history-status">{item.status}</span>{item.model_url && (profile?.plan==='free'?<span className="locked-label"><LockKeyhole size={13}/> Paid export</span>:<button className="secondary-button" onClick={()=>openHistory(item)}>Open model</button>)}</div>)}</div>:<div className="empty-library"><Box size={30}/><h3>No models yet.</h3><p>Your models will show up here after generation.</p><button className="primary-button" onClick={()=>setView('studio')}>Create a model</button></div>}</section>}
        {view==='plans' && <section className="library"><div className="eyebrow"><i/> WORKSPACE USAGE</div><h1>Plans & <em>credits.</em></h1><p className="subtitle">Choose how you create. Payments for India are UPI only.</p><div className="plans-grid"><article className="plan-card"><span>START HERE</span><h2>Free</h2><strong>₹0</strong><p>Try AS3D with one model.</p><ul><li><CheckCircle2 size={15}/> 1 3D generation per account</li><li><CheckCircle2 size={15}/> Interactive model preview</li><li><LockKeyhole size={15}/> Downloads disabled</li></ul><button className="secondary-button" onClick={()=>setView('studio')}>Current free experience</button></article><article className="plan-card featured-plan"><span>FOR CREATORS</span><h2>Paid plans</h2><strong>UPI checkout</strong><p>Plans and credit packs will be configured before launch.</p><ul><li><CheckCircle2 size={15}/> More model generations</li><li><CheckCircle2 size={15}/> GLB, STL, OBJ and USDZ export tools</li><li><CheckCircle2 size={15}/> Credits after verified payment</li></ul><button className="primary-button" onClick={()=>setMessage('UPI payment gateway is not connected yet. No payment was taken.')}>Notify me when available</button><small>UPI-only checkout is planned. Do not collect payments until gateway verification is configured.</small></article></div><div className="upi-note"><CreditCard size={20}/><div><b>UPI only in India</b><p>BHIM, Google Pay, PhonePe and Paytm may be supported through a compatible payment gateway. This prototype does not take payments or automatically activate paid subscriptions yet.</p></div></div>{message&&<p className="inline-message">{message}</p>}</section>}
        <footer className="footer"><b>AS3D</b><span>CREATIVE TOOLS FOR CURIOUS MINDS</span><small>Powered by Tripo API · Independent project</small></footer>
      </div>
    </main>
    {authOpen&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setAuthOpen(false)}}><section className="auth-modal"><button className="close-modal" onClick={()=>setAuthOpen(false)}><X size={17}/></button><div className="brand-mark"><Box size={22}/></div><span className="eyebrow">CREATOR ACCOUNT</span><h2>{authMode==='signup'?'Make room for ideas.':'Welcome back.'}</h2><p>{authMode==='signup'?'Create an account to generate one model for free.':'Sign in to continue creating.'}</p><form onSubmit={authenticate}>{authMode==='signup'&&<label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>}<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary-button" type="submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>: <LogIn size={16}/>} {busy?'Please wait…':authMode==='signup'?'Create account':'Sign in'}</button></form>{message&&<p className="inline-message">{message}</p>}{error&&<p className="inline-error">{error}</p>}<p className="auth-switch">{authMode==='signup'?'Already have an account?':'New to AS3D?'} <button onClick={()=>{setAuthMode(authMode==='signup'?'signin':'signup');setError('');setMessage('')}}>{authMode==='signup'?'Sign in':'Create account'}</button></p><small>Authentication powered by Supabase</small></section></div>}
  </div>;
}
import '@google/model-viewer';
createRoot(document.getElementById('root')).render(<App />);
