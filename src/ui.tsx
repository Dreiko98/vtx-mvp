import {useState,type ReactNode,type FormEvent} from 'react';
import {X,Check,ChevronDown,LoaderCircle} from 'lucide-react';
import {statusLabels,type Match} from './domain';
export const money=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
export const number=(n:number)=>new Intl.NumberFormat('en-GB').format(n);
export const day=(v:string)=>v?new Date(v.length===10?v+'T12:00:00':v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
export function Logo(){return <span className="logo"><span>VT</span><img src="/assets/vtx-x.png" alt="X"/><span className="logo-label">ATHLETE</span></span>;}
export function Monogram({name,round=false}:{name:string;round?:boolean}){return <span aria-hidden="true" className={'monogram '+(round?'round':'')}>{name.split(' ').slice(0,2).map(n=>n[0]).join('')}</span>;}
export function Badge({status}:{status:string}){return <span className={'badge '+status}>{statusLabels[status]||status}</span>;}
export function Score({score}:{score:number}){return <span className={'score '+(score>=80?'high':score>=60?'mid':'low')}>{score}<small>%</small></span>;}
export function MatchBreakdown({match}:{match:Match}){return <div className="match-breakdown"><div className="row"><h3>Why this offer fits</h3><Score score={match.score}/></div>{match.factors.map(f=><div key={f.label} className="factor"><div className="row"><strong>{f.label}</strong><span>{f.points}/{f.maximum}</span></div><div className="bar"><i style={{width:`${100*f.points/f.maximum}%`}}/></div><p>{f.reason}</p></div>)}<p className="caption">{match.source}</p></div>;}
export function Header({eyebrow,title,description,action}:{eyebrow:string;title:ReactNode;description?:string;action?:ReactNode}){return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>{action&&<div className="header-action">{action}</div>}</header>;}
export function Card({title,children,action,className=''}:{title?:ReactNode;children:ReactNode;action?:ReactNode;className?:string}){return <section className={'card '+className}>{title&&<div className="section-heading"><h2>{title}</h2>{action}</div>}{children}</section>;}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><span className="empty-mark">×</span><h3>{title}</h3>{children&&<p>{children}</p>}</div>;}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin"/> Loading your workspace…</div>;}
export function ErrorBox({error}:{error:string}){return error?<p className="error" role="alert">{error}</p>:null;}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={'modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X/></button></div>{children}</section></div>;}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Chips({options,selected,onChange}:{options:string[];selected:string[];onChange:(s:string[])=>void}){return <div className="chips">{options.map(v=><button type="button" aria-pressed={selected.includes(v)} key={v} className={'chip '+(selected.includes(v)?'selected':'')} onClick={()=>onChange(selected.includes(v)?selected.filter(s=>s!==v):[...selected,v])}>{selected.includes(v)&&<Check size={14}/>} {v}</button>)}</div>;}
export function ActionForm({onSubmit,children,label='Save changes',className='',secondary}:{onSubmit:()=>Promise<unknown>;children:ReactNode;label?:string;className?:string;secondary?:ReactNode}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await onSubmit();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className={'form '+className} onSubmit={submit}><fieldset disabled={busy}>{children}<ErrorBox error={error}/><div className="form-actions">{secondary}<button className="button primary" type="submit">{busy?<><LoaderCircle className="spin" size={16}/> Saving…</>:label}</button></div></fieldset></form>;
}
export function Fold({title,children,open=false}:{title:ReactNode;children:ReactNode;open?:boolean}){return <details className="fold" open={open||undefined}><summary>{title}<ChevronDown size={18}/></summary><div className="fold-content">{children}</div></details>;}
