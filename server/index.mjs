import {createService} from './app.mjs';
const port=Number(process.env.PORT||8787);
const service=createService({presenterKey:process.env.PRESENTER_KEY,publicUrl:process.env.PUBLIC_URL||`http://127.0.0.1:${port}`});
service.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`SeminarComment listening on port ${port}. Comment bodies are not logged or stored.`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await service.close();process.exit(0);});
