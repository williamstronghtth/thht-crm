const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function loadDb(env) {
  let call;
  const ctx = {process:{env}, module:{exports:{}}, __dirname:__dirname,
    console:{log(){}}, require(name){
      if(name==='./cache') return {getReadOnlyStatus(){}};
      if(name==='@supabase/supabase-js') return {createClient(...args){call=args;return {};}};
      return require(name);
    }};
  vm.runInNewContext(fs.readFileSync(__dirname+'/db.js','utf8'),ctx);
  return {call,db:ctx.module.exports};
}
test('server secret takes priority and disables browser session handling',()=>{
  const {call}=loadDb({SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'server-secret',SUPABASE_ANON_KEY:'public'});
  assert.equal(call[1],'server-secret');
  assert.equal(call[2].auth.persistSession,false);
  assert.equal(call[2].auth.autoRefreshToken,false);
  assert.equal(call[2].auth.detectSessionInUrl,false);
});
test('existing legacy service role is supported',()=>{
  assert.equal(loadDb({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'legacy-server'}).call[1],'legacy-server');
});
test('anonymous key is never a server credential fallback',()=>{
  assert.throws(()=>loadDb({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public'}),/server-only credential/);
});
test('unconfigured local development still works',()=>assert.equal(loadDb({}).db.USE_SUPABASE,false));
function checkAuth(raw,req){
  const ctx={process:{env:{CRM_API_KEYS:raw}},module:{exports:{}},require,console:{error(){}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/api-auth.js','utf8'),ctx);
  let status,passed=false;
  ctx.module.exports.apiAuthMiddleware({path:'/api/clients',headers:{},...req},{status(n){status=n;return this;},json(){return this;}},()=>passed=true);
  return {status,passed};
}
test('missing API configuration rejects anonymous requests',()=>assert.equal(checkAuth(undefined,{}).status,401));
test('malformed API configuration rejects forged keys',()=>assert.equal(checkAuth('invalid',{headers:{'x-api-key':'forged'}}).status,403));
test('valid server API key still works',()=>assert.equal(checkAuth('[{"name":"test","key":"valid"}]',{headers:{'x-api-key':'valid'}}).passed,true));
test('authenticated browser session still works without API keys',()=>assert.equal(checkAuth(undefined,{user:{name:'test'}}).passed,true));
test('health endpoint remains public',()=>assert.equal(checkAuth(undefined,{path:'/healthz'}).passed,true));
