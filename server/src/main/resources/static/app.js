'use strict';
const $=id=>document.getElementById(id);
let csrf=null,challengeId=null,currentIssue=null,issued=null;
const requestKeys=new Map();
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
async function api(path,body){
  const options={credentials:'same-origin',headers:{}};
  let identity;
  if(body!==undefined){
    if(!csrf){const response=await fetch('/api/v1/auth/csrf',{credentials:'same-origin'});if(!response.ok)throw new Error('서버에 연결할 수 없어요.');csrf=(await response.json()).data;}
    identity=path+JSON.stringify(body);
    if(!requestKeys.has(identity))requestKeys.set(identity,crypto.randomUUID());
    options.method='POST';options.headers={'Content-Type':'application/json',[csrf.headerName]:csrf.token,'Idempotency-Key':requestKeys.get(identity)};options.body=JSON.stringify(body);
  }
  let response;
  try{response=await fetch('/api/v1'+path,options);}catch{throw new Error('처리 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.');}
  const payload=await response.json();
  if(identity)requestKeys.delete(identity);
  if(!response.ok){const error=new Error(payload.error?.message||'처리하지 못했어요.');error.code=payload.error?.code;if(response.status===401 && !path.startsWith('/auth/'))await showAuth();throw error;}
  return payload.data;
}
function formHandler(id,action){$(id).addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;notice('');try{await action(new FormData(event.target));}catch(error){if($(id).closest('dialog'))$('dialog-notice').textContent=error.message;else notice(error.message);}finally{button.disabled=false;}});}
function authTab(activate){$('login-form').hidden=activate;$('activate-form').hidden=!activate;$('mfa-form').hidden=true;$('login-tab').classList.toggle('selected',!activate);$('activate-tab').classList.toggle('selected',activate);notice('');}
async function showAuth(){for(const id of ['admin-view','member-view'])$(id).hidden=true;$('auth-view').hidden=false;challengeId=null;authTab(false);}
async function loadMe(){const me=await api('/me');$('auth-view').hidden=true;notice('');if(me.roles.includes('OPERATOR')){$('admin-view').hidden=false;$('member-view').hidden=true;await refreshMembers();}else{$('admin-view').hidden=true;$('member-view').hidden=false;$('welcome-name').textContent=`${me.name}님, 반가워요.`;$('profile-name').textContent=me.name;$('profile-phone').textContent=me.phone;}}
$('login-tab').addEventListener('click',()=>authTab(false));$('activate-tab').addEventListener('click',()=>authTab(true));$('mfa-back').addEventListener('click',()=>{challengeId=null;authTab(false);});
formHandler('login-form',async form=>{const data=await api('/auth/login',{phone:form.get('phone'),password:form.get('password')});$('login-password').value='';if(data.mfaRequired){challengeId=data.challengeId;$('login-form').hidden=true;$('mfa-form').hidden=false;$('mfa-code').value='';$('mfa-code').focus();}else await loadMe();});
formHandler('mfa-form',async form=>{await api('/auth/mfa/verify',{challengeId,totp:form.get('totp')});$('mfa-code').value='';challengeId=null;await loadMe();});
formHandler('activate-form',async form=>{if(form.get('newPassword')!==$('confirm-password').value)throw new Error('비밀번호 확인이 일치하지 않아요.');await api('/auth/code/consume',{challengeId:form.get('challengeId'),code:form.get('code'),newPassword:form.get('newPassword')});$('activate-form').reset();authTab(false);notice('비밀번호를 설정했어요. 등록된 휴대전화번호로 로그인해 주세요.');});
document.querySelectorAll('.logout').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/auth/logout',{});await showAuth();}catch(error){notice(error.message);}finally{button.disabled=false;}}));
formHandler('register-form',async form=>{await api('/admin/members',{name:form.get('name'),phone:form.get('phone'),age14Verified:$('age-confirm').checked});$('register-form').reset();await refreshMembers();notice('회원을 등록했어요. 목록에서 승인한 뒤 활성화 코드를 발급하세요.');});
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
async function refreshMembers(){
  $('member-list').replaceChildren(element('p','empty','회원 목록을 불러오는 중이에요.'));
  try{const data=await api('/admin/members');$('member-count').textContent=data.items.length;$('member-list').replaceChildren();if(!data.items.length)$('member-list').append(element('p','empty','아직 등록된 회원이 없어요.\n새 회원을 등록해 보세요.'));
    for(const member of data.items){const card=element('article','member'),top=element('div','member-top'),info=element('div');info.append(element('p','member-name',member.name),element('p','member-phone',member.phone));const label=member.status==='SUSPENDED'?'이용 정지':member.status==='PENDING'?'승인 대기':member.accountStatus==='PENDING'?'활성화 대기':'이용 가능';top.append(info,element('span','badge'+(member.status==='SUSPENDED'?' suspended':member.accountStatus==='ACTIVE'?' active':''),label));card.append(top);const actions=element('div','member-actions');
      if(member.status!=='ACTIVE')actions.append(actionButton('회원 승인',()=>changeStatus(member,'ACTIVE')));
      if(member.status==='ACTIVE'){actions.append(actionButton(member.accountStatus==='PENDING'?'활성화 코드':'비밀번호 재설정',()=>openCode(member)));actions.append(actionButton('이용 정지',()=>changeStatus(member,'SUSPENDED')));}
      card.append(actions);$('member-list').append(card);}
  }catch(error){$('member-list').replaceChildren(element('p','empty','목록을 가져오지 못했어요. 새로고침으로 다시 시도해 주세요.'));throw error;}
}
function actionButton(label,action){const button=element('button','outline',label);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;notice('');try{await action();}catch(error){notice(error.message);}finally{button.disabled=false;}});return button;}
async function changeStatus(member,status){const reason=window.prompt(`${member.name} 회원의 ${status==='ACTIVE'?'승인':'이용 정지'} 사유를 입력하세요.`);if(!reason)return;await api(`/admin/accounts/${member.accountId}/status`,{status,reason,expectedVersion:member.version});await refreshMembers();}
$('refresh-members').addEventListener('click',async event=>{event.target.disabled=true;try{await refreshMembers();}catch(error){notice(error.message);}finally{event.target.disabled=false;}});
function openCode(member){currentIssue=member;issued=null;$('issue-form').hidden=false;$('issued-result').hidden=true;$('reauth-form').hidden=true;$('dialog-notice').textContent='';$('identity-confirm').checked=false;$('issue-title').textContent='일회용 코드 발급';$('issue-member').textContent=`${member.name} · ${member.phone}`;$('issue-purpose').value=member.accountStatus==='PENDING'?'ACTIVATE':'RESET';$('code-dialog').showModal();}
function closeCode(){$('code-dialog').close();$('issued-code').textContent='';$('issued-id').textContent='';$('reauth-form').reset();issued=null;currentIssue=null;}
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',closeCode));$('code-dialog').addEventListener('cancel',()=>{$('issued-code').textContent='';issued=null;currentIssue=null;});
formHandler('issue-form',async()=>{try{issued=await api(`/admin/accounts/${currentIssue.accountId}/codes`,{purpose:$('issue-purpose').value,identityVerified:$('identity-confirm').checked,reason:$('issue-reason').value});}catch(error){if(error.code==='REAUTH_REQUIRED'){$('reauth-form').hidden=false;$('reauth-password').focus();}throw error;}$('issue-form').hidden=true;$('reauth-form').hidden=true;$('issued-result').hidden=false;$('dialog-notice').textContent='';$('issued-id').textContent=issued.challengeId;$('issued-code').textContent=issued.code;$('issued-expiry').textContent=`유효 기한: ${new Date(issued.expiresAt).toLocaleString('ko-KR')}`;});
formHandler('reauth-form',async form=>{await api('/auth/reauthenticate',{password:form.get('password'),totp:form.get('totp')});$('reauth-form').reset();$('reauth-form').hidden=true;$('dialog-notice').textContent='본인 인증을 마쳤어요. 위의 코드 발급 버튼을 눌러 주세요.';});
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`발급 식별자: ${issued.challengeId}\n일회용 코드: ${issued.code}\n유효 기한: ${new Date(issued.expiresAt).toLocaleString('ko-KR')}`);$('dialog-notice').textContent='복사했어요.';}catch{$('dialog-notice').textContent='복사하지 못했어요. 발급 정보를 직접 선택해 복사해 주세요.';}});
loadMe().catch(()=>showAuth());
