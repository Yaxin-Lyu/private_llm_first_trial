const { contextBridge, ipcRenderer } = require('electron');

// Narrow, isolated bridge. The API key stays in the main process.
contextBridge.exposeInMainWorld('lyx', {
  appName: 'lyx',
  exportChatPDF: (chat) => ipcRenderer.invoke('chat:export-pdf',chat),
  hasApiKey: () => ipcRenderer.invoke('settings:has-key'),
  saveApiKey: (key) => ipcRenderer.invoke('settings:set-key', key),
  getPromptSettings: () => ipcRenderer.invoke('settings:get-prompt'),
  savePromptSettings: (text) => ipcRenderer.invoke('settings:set-prompt',text),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  previewLibrary: (id) => ipcRenderer.invoke('library:preview',id),
  removeLibrary: (id) => ipcRenderer.invoke('library:remove',id),
  cancelLibraryImport: (id) => ipcRenderer.invoke('library:cancel',id),
  importLibrary: (kind,requestId,onProgress) => {
    const listener=(_event,id,progress)=>{if(id===requestId&&typeof onProgress==='function')onProgress(progress);};
    ipcRenderer.on('library:progress',listener);
    return ipcRenderer.invoke('library:import',{kind,requestId})
      .finally(()=>ipcRenderer.removeListener('library:progress',listener));
  },
  addAttachment: (file) => ipcRenderer.invoke('attachments:add', file),
  previewAttachment: (id) => ipcRenderer.invoke('attachments:preview', id),
  removeAttachment: (id) => ipcRenderer.invoke('attachments:remove', id),
  clearAttachments: () => ipcRenderer.invoke('attachments:clear'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  getRate: () => ipcRenderer.invoke('toolbox:get-rate'),
  hasRateKey: () => ipcRenderer.invoke('toolbox:has-rate-key'),
  saveRateKey: (key) => ipcRenderer.invoke('toolbox:set-rate-key', key),
  getTranslationOptions: () => ipcRenderer.invoke('translation:options'),
  cancelTranslation: (id) => ipcRenderer.invoke('translation:cancel', id),
  copyTranslation: (text) => ipcRenderer.invoke('translation:copy', text),
  translateText: (options, onChunk) => {
    const listener=(_event,id,delta)=>{
      if(id===options.requestId && typeof onChunk==='function') onChunk(delta);
    };
    ipcRenderer.on('translation:chunk',listener);
    return ipcRenderer.invoke('translation:start',options)
      .finally(()=>ipcRenderer.removeListener('translation:chunk',listener));
  },
  streamReply: (model, messages, onChunk, options={}) => {
    const requestId = globalThis.crypto.randomUUID();
    const listener = (_event, id, delta) => {
      if (id === requestId && typeof onChunk === 'function') onChunk(delta);
    };
    ipcRenderer.on('openai:stream-chunk', listener);
    const sourcesListener=(_event,id,value)=>{if(id===requestId&&typeof options.onSources==='function')options.onSources(value);};
    ipcRenderer.on('openai:sources',sourcesListener);
    return ipcRenderer.invoke('openai:stream-reply', { requestId, model, messages,libraryIds:options.libraryIds||[] })
      .finally(() => {
        ipcRenderer.removeListener('openai:stream-chunk', listener);
        ipcRenderer.removeListener('openai:sources',sourcesListener);
      });
  }
});
