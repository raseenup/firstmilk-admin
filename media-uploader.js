/* FMV marketing media uploader: 50 MB per image/GIF/MP4, bounded resumable binary parts. */
(() => {
  'use strict';
  const MAX_FILE=50_000_000;
  const SIZE=2_000_000;
  const allowed={
    'image/jpeg':/\.jpe?g$/i,
    'image/png':/\.png$/i,
    'image/gif':/\.gif$/i,
    'image/webp':/\.webp$/i,
    'video/mp4':/\.mp4$/i
  };
  const pause=(delay)=>new Promise(resolve=>setTimeout(resolve,delay));
  function validate(file){
    if(!(file instanceof File) || !file.size)throw new Error('Choose an image or video to upload.');
    if(file.size>MAX_FILE)throw new Error('Maximum 50 MB per promotion image or video.');
    if(!allowed[file.type] || !allowed[file.type].test(file.name))
      throw new Error('Use JPG, PNG, GIF, WebP or MP4 with matching file extension and MIME type.');
  }
  async function request(path,{method='GET',body,token,signal,binary=false}={}){
    if(!token || token!==FMV.sessionId)throw new Error('Your sign-in session changed. Sign in again to upload.');
    const headers={};
    if(body && !binary)headers['Content-Type']='application/json';
    if(binary)headers['Content-Type']='application/octet-stream';
    let response;
    try{
      response=await fetch(FMV.apiBase+path,{
        method,headers,body:body?(binary?body:JSON.stringify(body)):undefined,
        cache:'no-store',signal:signal || AbortSignal.timeout(60_000)
      });
    }catch(error){
      if(error.name==='AbortError')throw error;
      throw new Error('Upload connection interrupted. Check your connection and retry.');
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const message=typeof data.detail==='string'?data.detail:
        response.status===413?'File or chunk is too large.':
        'Upload could not be completed ('+response.status+').';
      const error=new Error(message);error.status=response.status;throw error;
    }
    if(token!==FMV.sessionId)throw new Error('Your sign-in session changed during upload.');
    return data;
  }
  async function upload(file,{onProgress=()=>{},signal}={}){
    validate(file);
    const token=FMV.sessionId;
    if(!token)throw new Error('Sign in as a content administrator to upload.');
    const start=await request('/admin/content-media/uploads',{
      method:'POST',body:{filename:file.name,size_bytes:file.size},token,signal
    });
    const ident=encodeURIComponent(start.id);
    let offset=start.offset || 0;
    try{
      onProgress(0,file.size);
      while(offset<file.size){
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
        if(token!==FMV.sessionId)throw new Error('Session expired. Sign in again.');
        const part=file.slice(offset,Math.min(file.size,offset+SIZE));
        let attempts=0;
        while(true){
          try{
            const result=await request('/admin/content-media/uploads/'+ident+
              '/chunk?offset='+offset,{method:'POST',body:part,token,signal,binary:true});
            offset=result.offset;
            onProgress(offset,file.size);
            break;
          }catch(error){
            if(signal?.aborted||error.status===401||error.status===403||
              error.status===404||error.status===413||error.status===415||
              error.status===422||attempts++>=2)throw error;
            await pause(attempts*400);
            const status=await request('/admin/content-media/uploads/'+ident,{token,signal});
            if(status.offset>offset){
              offset=status.offset;onProgress(offset,file.size);
              break;
            }
          }
        }
      }
      const finished=await request('/admin/content-media/uploads/'+ident+
        '/complete',{method:'POST',token,signal});
      onProgress(file.size,file.size);
      return finished;
    }catch(error){
      // A timed-out session can be restarted using an entirely new upload.
      // An interrupted previous upload will expire automatically server-side;
      // do not expose upload ID or secret credentials in browser storage.
      throw error;
    }
  }
  window.FMVUpload={upload,validate,MAX_FILE,SIZE};
})();