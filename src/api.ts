let csrf='';
export function setCsrf(value:string){csrf=value;}
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const form=body instanceof FormData;
 const res=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(form?{}:{'Content-Type':'application/json'}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:form?body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed.');return data;
}
