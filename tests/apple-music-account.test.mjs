import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleMusicAccount, normalizeMusicKitSongs } from '../lib/apple-music-account.mjs';
import { validateAppleMusicDeveloperToken } from '../scripts/apple-music-config.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls=[], listeners=new Map();
  const music={isAuthorized:false,isPlaying:false,
    authorize(){calls.push('authorize');music.isAuthorized=true;return Promise.resolve('user-token-do-not-expose');},
    unauthorize(){calls.push('unauthorize');music.isAuthorized=false;return Promise.resolve();},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},
    setQueue(options){calls.push(['setQueue',options]);return Promise.resolve();},
    play(){calls.push('play');music.isPlaying=true;return Promise.resolve();},pause(){calls.push('pause');music.isPlaying=false;},
    api:{music:async(path,parameters)=>{calls.push(['search',path,parameters]);return {data:{results:{songs:{data:[]}}}}}},
  };
  const win={MusicKit:{configure:async options=>{calls.push(['configure',options]);return music;}}};
  return {calls,music,win,listeners,account:createAppleMusicAccount({config:{developerToken:'developer-token-do-not-expose'},window:win,document:{}})};
}

test('missing MusicKit configuration never loads a script or claims authorization',async()=>{
  const account=createAppleMusicAccount({config:null,window:{},document:{createElement(){throw Error('should not load');}}});
  assert.equal(account.configured,false);assert.equal(account.isAuthorized,false);
  await assert.rejects(account.prepare(),{code:'NOT_CONFIGURED'});
  await assert.rejects(account.authorize(),{code:'NOT_CONFIGURED'});
  await assert.rejects(account.search('BTS'),{code:'NOT_CONFIGURED'});
});

test('prepare is shared, authorization starts synchronously on the click, and tokens stay out of state',async()=>{
  const f=fixture();await Promise.all([f.account.prepare(),f.account.prepare()]);
  assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='configure').length,1);
  const result=f.account.authorize();assert.equal(f.calls.at(-1),'authorize');
  await result;assert.equal(f.account.isAuthorized,true);
  assert.ok(!JSON.stringify(f.account.state()).includes('token'));
  await f.account.disconnect();assert.equal(f.account.isAuthorized,false);
});

test('SDK timeout removes only its script and listener, then permits a clean retry',async()=>{
  const scripts=[], listeners=new Map();
  const win={setTimeout,clearTimeout};
  const doc={createElement(){return {remove(){this.removed=true;}};},head:{append(script){scripts.push(script);}},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const account=createAppleMusicAccount({config:{developerToken:'test-only'},window:win,document:doc,timeoutMs:5});
  const first=account.prepare(),second=account.prepare();
  await assert.rejects(first,{code:'SDK_TIMEOUT'});await assert.rejects(second,{code:'SDK_TIMEOUT'});
  assert.equal(scripts.length,1);assert.equal(scripts[0].removed,true);assert.equal(listeners.size,0);
  const f=fixture();win.MusicKit=f.win.MusicKit;await account.prepare();
  assert.equal(account.state().ready,true);assert.equal(scripts.length,1);
});

test('locking while the Apple popup is pending discards and revokes a late authorization',async()=>{
  const f=fixture(), pending=deferred();await f.account.prepare();
  f.music.authorize=()=>pending.promise;
  const login=f.account.authorize();f.account.suspend();
  await assert.rejects(f.account.authorize(),{code:'AUTH_BUSY'});
  f.music.isAuthorized=true;pending.resolve('private-token');
  await assert.rejects(login,{code:'CANCELLED'});
  assert.equal(f.account.isAuthorized,false);assert.ok(f.calls.includes('unauthorize'));
});

test('Apple authorization failures are sanitized and never mark the app connected',async()=>{
  const f=fixture();await f.account.prepare();f.music.authorize=()=>Promise.reject(Error('private-token from provider'));
  await assert.rejects(f.account.authorize(),error=>error.code==='AUTH_FAILED'&&!error.message.includes('private-token'));
  assert.equal(f.account.state().authorized,false);
});

test('catalog search uses the SDK storefront and ignores responses after cancellation',async()=>{
  const f=fixture();await f.account.prepare();await f.account.search('  NewJeans  ');
  assert.deepEqual(f.calls.at(-1),['search','/v1/catalog/{{storefrontId}}/search',{term:'NewJeans',types:'songs',limit:25}]);
  const pending=deferred();f.music.api.music=()=>pending.promise;
  const request=f.account.search('BTS');await turn();f.account.suspend();pending.resolve({data:{results:{songs:{data:[]}}}});
  await assert.rejects(request,{code:'CANCELLED'});
});

test('SDK song metadata cannot inject unrelated links or artwork hosts',()=>{
  const row={id:'1561837008',type:'songs',attributes:{name:'Shy Away',artistName:'twenty one pilots',albumName:'Scaled And Icy',url:'https://music.apple.com/us/album/name/1561836997?i=1561837008',artwork:{url:'https://is1-ssl.mzstatic.com/image/thumb/{w}x{h}.{f}'},durationInMillis:175000}};
  const result=normalizeMusicKitSongs({data:{results:{songs:{data:[row,row,{...row,attributes:{...row.attributes,url:'https://evil.example/123'}}]}}}});
  assert.equal(result.length,1);assert.equal(result[0].title,'Shy Away');assert.equal(result[0].artist,'twenty one pilots');
  assert.equal(result[0].artworkUrl,'https://is1-ssl.mzstatic.com/image/thumb/200x200.jpg');
  assert.equal(normalizeMusicKitSongs({data:{results:{songs:{data:[{...row,attributes:{...row.attributes,artwork:{url:'https://evil.example/cover.jpg'}}}]}}}})[0].artworkUrl,'');
});

test('play queues a verified song through MusicKit and a pause cancels pending playback',async()=>{
  const f=fixture();await f.account.prepare();
  const track={id:'1561837008',url:'https://music.apple.com/us/song/shy-away/1561837008'};
  await assert.rejects(f.account.play(track),{code:'AUTH_REQUIRED'});
  await f.account.authorize();await f.account.play(track);
  assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='setQueue'&&x[1].song===track.id&&x[1].startPlaying===false));
  assert.equal(f.account.state().playing,true);
  const pending=deferred();f.music.setQueue=()=>pending.promise;
  const play=f.account.play(track);await turn();f.account.pause();pending.resolve();
  await assert.rejects(play,{code:'CANCELLED'});assert.equal(f.account.state().playing,false);
});

test('developer token build validation rejects private keys, bad algorithms and expired tokens without echoing input',()=>{
  const now=1800000000;
  const jwt=(header,claims)=>[header,claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.signature';
  const header={alg:'ES256',kid:'KEYID'},claims={iss:'TEAMID',iat:now-60,exp:now+3600};
  assert.deepEqual(validateAppleMusicDeveloperToken(jwt(header,claims),{now}),{expiresAt:now+3600});
  for(const value of ['-----BEGIN PRIVATE KEY-----',jwt({...header,alg:'none'},claims),jwt(header,{...claims,exp:now-1}),jwt(header,{...claims,iat:now+1000})]){
    assert.throws(()=>validateAppleMusicDeveloperToken(value,{now}),error=>!error.message.includes(value));
  }
});
