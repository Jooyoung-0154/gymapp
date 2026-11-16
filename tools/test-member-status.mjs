// [목적] 실제 상태 변경 모달의 이벤트 코드를 실행해 승인·취소·입력 오류를 검증합니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../server/src/main/resources/static/app.js',import.meta.url),'utf8');
const setup=source.slice(0,source.indexOf('// [기능] authTab'));
const status=source.slice(source.indexOf('// [기능] changeStatus는'),source.indexOf("$('refresh-members').addEventListener"));
function screen(fail=false){
  const nodes=new Map(),calls=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,open:false,events:{},
      addEventListener(type,fn){this.events[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},
      reset(){this.resets=(this.resets||0)+1;},focus(){this.focused=true;},
      closest(){return {querySelector(){return node('status-notice');}};}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:node},crypto:{randomUUID:()=> 'test-operation-key'},fetch:()=>{throw Error('unexpected fetch');},
    FormData:class{constructor(target){this.target=target;}get(name){return this.target.values?.[name];}},
    request:async(path,body)=>{calls.push({path,body});if(fail)throw Error('server-rejected');return {};},
    refreshMembers:async()=>{},});
  vm.runInContext(setup+'\napi=request;\n'+status+'\nthis.openStatus=changeStatus;',context);
  const member={name:'TEST member',phone:'01000000000',accountId:'42',version:3};
  return {node,calls,open:(state='ACTIVE')=>context.openStatus(member,state),submit:async reason=>{
    const form=node('status-form');form.values={reason};
    await form.events.submit({preventDefault(){},submitter:node('status-submit'),target:form});
  }};
}
test('approval opens an in-page form without sending a mutation',()=>{
  const s=screen();s.open();
  assert.equal(s.node('status-dialog').open,true);
  assert.equal(s.node('status-title').textContent,'회원 승인');
  assert.equal(s.node('status-reason').focused,true);
  assert.equal(s.calls.length,0);
});
test('cancel closes the form without changing the member',()=>{
  const s=screen();s.open();s.node('status-cancel').events.click();
  assert.equal(s.node('status-dialog').open,false);assert.equal(s.calls.length,0);
});
test('blank reason is reported inside the status dialog',async()=>{
  const s=screen();s.open();await s.submit('   ');
  assert.equal(s.calls.length,0);assert.equal(s.node('status-dialog').open,true);
  assert.match(s.node('status-notice').textContent,/사유/);
});
test('approval submits trimmed reason, target and expected version, then closes',async()=>{
  const s=screen();s.open();await s.submit('  확인 완료  ');
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].path,'/admin/accounts/42/status');
  assert.equal(s.calls[0].body.status,'ACTIVE');assert.equal(s.calls[0].body.reason,'확인 완료');assert.equal(s.calls[0].body.expectedVersion,3);
  assert.equal(s.node('status-dialog').open,false);
});
test('suspension uses the same form with the correct status',async()=>{
  const s=screen();s.open('SUSPENDED');await s.submit('확인');
  assert.equal(s.node('status-title').textContent,'이용 정지');
  assert.equal(s.calls[0].body.status,'SUSPENDED');
});
test('server failure leaves the form open and shows its error',async()=>{
  const s=screen(true);s.open();await s.submit('확인');
  assert.equal(s.node('status-dialog').open,true);
  assert.equal(s.node('status-notice').textContent,'server-rejected');
  assert.equal(s.node('status-cancel').disabled,false);
});
