# 헬스장 앱 API 명세서

버전: 0.1 · 2026-10-19 · 상태: 구현 전 개발 설계안

근거: [요구사항](요구사항정의서.md) v1.1, [DB 설계](DB설계서.md) v1.1, [업무 규칙](업무규칙표.md) v0.2. 정책은 요구사항을 우선한다. 경로·필드·상태코드·인증 전달 방식은 이번 기술 제안이며 실제 제공 중인 API가 아니다. 기존 사용자 확정/기본안 구분을 승계한다. 아래 표의 입력·출력은 업무 필드이며 공통 메타데이터는 생략했다.

## 1. 공통 계약

- HTTPS `/api/v1`, JSON UTF-8. ID는 bigint 정밀도 손실을 막기 위해 문자열, 날짜는 `YYYY-MM-DD`, 시각은 UTC RFC3339다. 출석일·예약 월·만료일 계산은 Asia/Seoul 서버 시각을 사용한다.
- 회원·트레이너·운영자 역할은 실제 세션에서 결정한다. 요청의 role/actor 값으로 권한을 얻을 수 없다. 회원 ID·일지 ID 등 모든 객체에 매 요청 범위 검증을 한다. 단일 헬스장이므로 지점 선택 인자는 없다.
- 웹은 Secure/HttpOnly/SameSite 쿠키 세션과 쓰기 CSRF 검증, 앱은 OS 보안 저장소의 opaque Bearer 세션을 제안한다. 입구 기기는 별도 제한 범위 기기 자격증명을 쓴다. 일반 계정 인증과 대체 사용하지 못한다. 로그아웃·정지·퇴사·탈퇴는 서버에서 즉시 회수한다.
- 운영자 MFA 완료 전에는 운영 API 접근 불가. 회원/트레이너 7일 미활동·최대30일, 운영자 30분·최대12시간. 민감 작업의 재인증 증표는 계정·행위에 묶고 5분·1회 사용으로 제안한다.
- 성공 `{"data":{},"meta":{"requestId":"...","serverTime":"..."}}`, 실패 `{"error":{"code":"SLOT_CONFLICT","message":"다른 예약이 먼저 확정되었습니다.","fields":[]},"meta":{"requestId":"...","serverTime":"..."}}`. 비밀값·타인 정보·내부 SQL은 오류에 포함하지 않는다.
- 목록은 `cursor`, `limit`(기본20, 최대100), 응답 `items,nextCursor`. 안정적인 시각+ID 순으로 페이지를 만든다. 기간 조회 최대366일을 제안하며 큰 운영 조회는 기간을 나눈다.
- 생성 201, 조회·명령 결과 200, 비동기 작업 접수 202. 202는 파기·재판정 완료를 뜻하지 않는다. 400 형식, 401 인증, 403 역할/CSRF, 404 없음 또는 범위 밖 객체, 409 경합/상태/중복키 충돌, 422 업무 조건, 429 제한, 503 일시 장애. 429/503은 가능한 경우 Retry-After 제공.
- 모든 POST/PATCH/PUT/DELETE는 `Idempotency-Key` 필수. 주체+HTTP 메서드+정규화 경로+키를 고유 처리하고 요청 본문 해시를 비교한다. 동일 내용 재전송은 최초 결과, 다른 내용은 409 `IDEMPOTENCY_MISMATCH`, 진행 중이면 409 `REQUEST_IN_PROGRESS`. 결과 조회는 `GET /operations/{key}`(동일 주체만)로 지원한다. 개인정보·비밀 입력은 결과 저장소에 복제하지 않는다. 결과 보관은 24시간 제안, 업무 원장 고유성은 그 이후에도 유지한다. 인증 코드·기기 최초 연결 같은 미인증 요청은 서버 발급 challenge로 주체 범위를 묶고 별도 속도 제한한다.
- 기존 자원 수정·승인·취소는 `expectedVersion` 필수, 성공 때 새 version 반환. 불일치는 409 `VERSION_CONFLICT`. 최초 생성·인증·읽음 처리는 예외다. 다중 자원 작업은 주요 자원 버전과 영향 미리보기 토큰을 함께 검증한다.
- 사유가 필요한 명령은 `reason` 1~1,000자 일반 텍스트(제안). 협의 기록은 `consulted=true,consultedAt`이며 동의가 필요한 제안에는 회원의 실제 승인 계정을 저장한다. 클라이언트의 동의 불리언만으로 회원 승인을 대신하지 못한다.

## 2. 계정·인증 API

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| AU01 | POST /auth/login | 비로그인 | phone,password → 인증 세션 또는 mfaChallenge; 계정 존재 여부 동일 오류 |
| AU02 | POST /auth/mfa/verify | 로그인 challenge | challengeId,totp 또는 recoveryCode → 세션; 복구 시 재등록 전용 흐름 |
| AU03 | POST /auth/code/consume | 코드 보유자 | challengeId,code,newPassword → 활성화/재설정 결과; 재설정 시 기존 세션 회수 |
| AU04 | POST /auth/reauthenticate | 로그인 | password,운영자 추가 인증 → 행위 제한 재인증 증표 |
| AU05 | POST /auth/logout | 로그인 | 현재 또는 전체 세션 범위 → 회수 결과 |
| AU06 | GET /me | 로그인 | 없음 → 계정 상태·허용 역할·최소 프로필 |
| AU07 | POST /me/password-change | 로그인+재인증 | newPassword → 변경·기존 세션 종료 |
| AU08 | POST /me/mfa/enrollments | 운영자/선택 트레이너+재인증 | 없음 → 등록 challenge·일회 노출 secret; 일반 로그 제외 |
| AU09 | POST /me/mfa/enrollments/{id}/confirm | 본인 | totp → 활성화·일회 노출 복구 코드10개 |
| AU10 | POST /admin/accounts/{id}/codes | 운영자+재인증 | purpose(ACTIVATE/RESET),identityVerified,reason → 일회 노출 코드·만료 |
| AU11 | POST /admin/accounts/{id}/mfa-recovery | 별도 복구 권한 운영자+재인증 | 현장 본인확인 근거,reason → 기존 MFA/세션 회수·재등록 필요 |

AU11은 유일 운영자 잠금의 자동 우회 API가 아니다. 운영자 전원 접근 불가 시 시스템 담당자의 별도 현장 복구 절차·감사 기록이 필요하다. 코드 활성화24시간/재설정15분, 새 발급 시 기존 폐기, 5회 실패 폐기. 비밀번호12~128자. 로그인 계정별15분 내5회 실패 시15분 제한. 비밀 원문과 인증 결과는 캐시 금지.

## 3. 회원·이용권·담당 관리

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| MB01 | GET /admin/members, GET /admin/members/{id} | 운영자 | 검색·상태 → 최소 프로필·이용 상태 |
| MB02 | POST /admin/members | 운영자 | name,phone → 승인 대기 계정·회원 |
| MB03 | POST /admin/accounts/{id}/status | 운영자 | status,reason,expectedVersion → 승인/정지/퇴사·회수 결과 |
| MB04 | PATCH /admin/accounts/{id}/phone | 운영자+재인증 | phone,identityVerified,reason,expectedVersion → 변경·이력 |
| MB05 | GET /members/{id}/memberships | 본인/운영자 | 없음 → 시설 시작·현재 만료·잔여일·연장 원장 |
| MB06 | POST /admin/members/{id}/memberships | 운영자 | 상품,startsOn,expiresOn,renewalOfId → 계약·갱신 체인 |
| MB07 | POST /admin/memberships/{id}/period-adjustments | 운영자 | 일수/기간,reason,expectedVersion → 원장·후속 계약 영향 |
| MB08 | GET /members/{id}/pt-passes | 본인/담당/운영자 | 없음 → 이용권별 잔여·확보·예약가능·유효기간 |
| MB09 | POST /admin/members/{id}/pt-passes | 운영자 | 상품,startsOn,expiresOn,credits → PT 계약·부여 원장 |
| MB10 | POST /pt-passes/{id}/credit-adjustments | 담당/운영자 | delta,reason,expectedVersion → 전후 잔액·원장; bookingId 금지 |
| MB11 | GET /trainer/members | 트레이너 | 검색 → 담당 회원 목록 |
| MB12 | GET /members/{id}/trainer-assignment | 본인/담당/운영자 | 없음 → 담당자·적용 구간 |
| MB13 | POST /admin/members/{id}/trainer-assignments | 운영자 | trainerId,effectiveAt,reason,consulted → 담당 이력·미처리 예약 영향 |
| MB14 | GET /admin/trainers, POST /admin/trainers | 운영자 | 검색 또는 계정 정보 → 트레이너 목록/등록 |

MB13만으로 기존 예약을 다른 트레이너에게 자동 이전하지 않는다. MB10은 면제 우회 상쇄를 허용하지 않으며 확보 미만 정정 거부. 이용권 기간 중복·연장 체인은 잠금과 원장으로 검증한다.

## 4. QR·출석·혼잡도·보상

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| AT01 | POST /me/qr-tokens | 회원 | 없음 → qrTokenId,token,issuedAt,expiresAt,refreshAfterSeconds=30 |
| AT02 | POST /device/check-ins | 등록 입구기기 | qrToken → checkInId,result,attendanceDate,displayUntil; 최소 결과만 |
| AT03 | GET /device/check-in-requests/{key} | 동일 기기 | 없음 → 최초 요청의 최소 결과/진행 상태 |
| AT04 | GET /members/{id}/attendance?month=YYYY-MM | 본인/운영자 | 월 → 일별 출석·월 고유 일수·정정 상태 |
| AT05 | GET /congestion | 로그인 | 없음 → count,level,configured,observedAt,staleAfterSeconds=180 |
| AT06 | GET /admin/attendance | 운영자 | memberId,from,to → 방문·원본/정정 이력 |
| AT07 | POST /admin/attendance-adjustments | 운영자 | memberId,occurredAt,action,대상ID,reason,expectedVersion(기존 정정) → 이력·재판정 작업ID |
| AT08 | GET /members/{id}/rewards | 본인/운영자 | 없음 → 0~9 진행·지급·검토 상태 |
| AT09 | POST /admin/reward-reviews | 운영자 | memberId,fromDate,reason → 재판정 작업ID(202) |
| AT10 | GET /admin/reward-reviews/{id} | 운영자 | 없음 → 부족·회수·유지·사용종결 제안 |
| AT11 | POST /admin/reward-reviews/{id}/resolve | 운영자 | decision,reason,expectedVersion → 지급/회수/사용종결 원장 |
| AT12 | GET /me/qr-tokens/{id}/status | 발급받은 본인 회원 | qrTokenId → ACTIVE/USED/EXPIRED/REVOKED,usedAt(성공 사용 시); Cache-Control: no-store |

2026-11-01 화면 연계 보완안: AT01의 qrTokenId는 조회용 식별자이며 입장 토큰을 대체하지 않는다. AT12는 매 요청 본인·계정·세션을 검증하고 타인/없는 ID는404다. URL·로그에 token 원문을 넣지 않는다. 회원 QR 화면에서만 2초 간격 조회를 기본안으로 하며 화면 이탈·USED·EXPIRED·REVOKED에서 해당 ID 조회를 중단한다. QR 교체 직전 ID는 원래 만료 시각까지 함께 확인해 유효한 이전 QR의 스캔 성공을 놓치지 않게 한다. USED는 출석 트랜잭션 커밋 이후에만 반환하며 EXPIRED로 성공을 추정하지 않는다. 기기 전용 AT03을 회원에게 공개하지 않는다. 이는 계약 보완이며 실행 API가 아니다.

AT02: 기기 인증→QR 유효60초·성공 미사용·세션 주체·계정·영업시간·자격 검증→회원 잠금→출석日/2시간 구간→이전 날짜 개근 판정→오늘 첫 인정 출석·10일 보상→QR 소비·요청 결과·알림 outbox를 한 트랜잭션으로 확정한다. 동일 기기·키의 같은 QR 재전송은 최초 성공을 복원하며 새 키의 이미 소비된 QR은 `QR_USED`다. 키 재사용의 다른 QR은 409다. 실패 시 전부 롤백하며 기기 결과는5초 후 지운다. 상세 보상/회원권 데이터는 기기에 반환하지 않는다.

PT_ONLY는 시작30분 전≤현재<종료, 시설 개근 제외·혼잡도 포함. 자정 재스캔은 새 날짜 출석만 만들고 기존2시간을 연장하지 않는다. 정확히2시간은 새 구간 가능. 혼잡도 미설정은 level=null, 장애는503이며 클라이언트는 마지막 성공180초 이상을 정보 지연으로 표시한다. 과거 정정 보상은 자동 회수하지 않는다.

## 5. 휴회

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| PA01 | GET /members/{id}/pauses | 본인/운영자 | 없음 → 정책·계약별 한도·신청 목록 |
| PA02 | POST /me/pauses | 회원 | membershipId,startsOn,endsOn → 대기 신청·정책 스냅샷 |
| PA03 | POST /pauses/{id}/withdraw | 본인 | expectedVersion → 시작 전 미승인 신청 취소 |
| PA04 | GET /admin/pauses | 운영자 | 상태·기간 → 심사 목록 |
| PA05 | POST /admin/pauses/preview | 운영자 | 신청ID 또는 소급 기간,action → 영향 이용권·예약·실제일수·버전 토큰 |
| PA06 | POST /admin/pauses/{id}/decision | 운영자 | APPROVE/REJECT,reason,expectedVersion,previewToken → 결과·원장·취소 예약 |
| PA07 | POST /admin/pauses | 운영자 | memberId,membershipId,startsOn,endsOn,reason,previewToken → 소급 포함 등록·대조 필요 상태 |
| PA08 | POST /admin/pauses/{id}/end-early | 운영자 | returnOn,reason,expectedVersion,previewToken → 실제 일수·재계산 |
| PA09 | POST /admin/pauses/{id}/cancel | 운영자 | reason,expectedVersion,previewToken → 승인 취소·연장 재계산 |

previewToken은 영향 자원 버전과 입력에 묶는다. 확정 시 재검증해 오래된 미리보기는409. 승인 시 해당 이용권 기간·겹친 예약 무차감취소·확보해제·알림 변경을 함께 커밋한다. 취소 예약은 자동 복원하지 않는다. 과거 수업·차감은 삭제하지 않고 별도 대조한다. 미설정 한도는 `POLICY_NOT_CONFIGURED`.

## 6. PT 슬롯·예약·정정·일지

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| PT01 | GET /members/{id}/available-slots | 본인/담당/운영자 | 기간 → 담당자 공개 슬롯·시각 |
| PT02 | GET /trainer/slots, POST /trainer/slots | 트레이너 | 기간 또는 startsAt → 본인 목록/1시간 공개 슬롯 |
| PT03 | POST /trainer/slots/{id}/withdraw | 본인 트레이너 | expectedVersion → 철회; 확정 예약 유지 |
| PT04 | GET /pt-bookings, GET /pt-bookings/{id} | 본인/담당/운영자 | 기간·상태 → 범위 내 예약·결과·확보·차감·version |
| PT05 | POST /pt-bookings | 회원/담당 트레이너 | memberId,slotId,트레이너 협의 기록 → 즉시확정 예약·선택 이용권·1회확보 |
| PT06 | POST /pt-bookings/{id}/reschedule | 본인/담당 | slotId,expectedVersion,담당자 reason·협의 기록 → 변경 예약; 24시간 미만 트레이너는 PT08 |
| PT07 | POST /pt-bookings/{id}/cancel | 본인/담당/운영자 | kind,reason,expectedVersion → 취소·확보·chargeDueAt |
| PT08 | POST /pt-bookings/{id}/change-proposals | 담당 | slotId,reason,expectedVersion → 대기 제안·원래 예약 유지 |
| PT09 | GET /me/booking-change-proposals | 회원 | 없음 → 본인 대기 제안 |
| PT10 | POST /booking-change-proposals/{id}/respond | 본인 회원 | ACCEPT/REJECT,expectedVersion,bookingVersion → 적용 결과 |
| PT11 | POST /pt-bookings/{id}/result | 담당/운영자 | ATTENDED/NO_SHOW,reason,expectedVersion → 수업 결과; 종료 후만 허용(제안) |
| PT12 | POST /admin/pt-bookings/{id}/charge-exceptions | 운영자 | WAIVE/RESTORE,originalCreditEntryId(복원),reason,expectedVersion → 면제/복원·원장 |
| PT13 | POST /admin/pt-bookings/{id}/transfer | 운영자 | assignmentId,slotId,consulted,reason,expectedVersion → 명시 이전 |
| PT14 | POST /admin/pt-bookings/{id}/corrections | 운영자 | 정정 시각/결과,reason,expectedVersion,previewToken → 정정·차감 대조; 과거 수정 전용 |
| PT15 | POST /admin/pt-bookings/{id}/correction-preview | 운영자 | 정정안 → 원장·확보 영향·previewToken |
| JN01 | GET /pt-journals, GET /pt-journals/{id} | 본인/담당/원작성자/운영자 | 기간·회원 → 허용 범위 일지·최종수정; 원작성자는 본인 작성분만 |
| JN02 | POST /pt-bookings/{id}/journal | 담당 수업 트레이너/운영자 | body → 종료 후1건·즉시공개·version |
| JN03 | PATCH /pt-journals/{id} | 원작성자/운영자 | body,reason,expectedVersion → 수정본·이력 |
| JN04 | POST /pt-journals/{id}/reports | 열람 권한자 | 민감 원문 없는 category → 신고접수 |
| JN05 | GET /admin/content-incidents | 운영자 | 상태 → 최소 신고 목록 |
| JN06 | POST /admin/content-incidents/{id}/resolve | 운영자 | RESTRICT/CORRECT/PURGE,reason,expectedVersion,정상정정본문(필요시) → 차단/정정/파기작업 상태 |

PT05는 공개 미래·다음 달 말일까지·담당·휴회·회원/트레이너 구간 충돌·수업 종료까지 유효한 이용권을 검사한다. 회원→트레이너ID순→이용권ID순 잠금, 유효한 이용권 중 만료·ID순으로 잔액-확보≥1을 선택해 고정한다. 예약·확보·요약·이벤트·알림 outbox를 함께 저장한다. 동시 마지막1회는 한 건만 성공한다.

PT06은 요청 수신 시각≤원래 시작-24시간. 트레이너는 사유·협의 기록을 남긴다. PT08은 시작 전24시간 미만만, 제안은 새 슬롯을 점유하지 않는다. PT10 승인 때 원래 예약 버전·현재 담당·새 자격·충돌 재검사, 실패 시 기존 예약·확보 유지. 시작 이후 제안 승인·일반 이동은 거부한다. 변경해도 확보 이용권은 바꾸지 않는다.

PT07 kind는 MEMBER_ON_TIME/MEMBER_LATE/TRAINER_REASON/ADMIN로 제안하되 서버가 시각·역할로 판정한다. 회원이 무차감 유형을 임의 선택하지 못한다. 늦은 취소는 원래 종료까지 확보 유지 후1회차감, 트레이너사정은 즉시해제·무차감. 자동 차감은 서버 작업이며 공개 실행 API를 두지 않는다. 예정 종료와 정확히 같은 시각에는 차감하지 않고 경과 후 수행한다. 일지·QR과 독립적이며 QR 미스캔을 자동 노쇼로 만들지 않는다.

일지1~5,000자 일반텍스트, 첨부/임시저장 제외. 수정 작성자는 실제 계정을 기록하며 원 트레이너 귀속은 변경하지 않는다. 운영자가 최초 작성할 때도 수업의 담당 트레이너 귀속을 보존한다. JN06은 본문과 모든 수정본을 즉시 차단하고 원문 키·백업을 함께 처리한다. 파기 작업 접수는 완료가 아니다.

## 7. 게시물·알림·운영

| ID | 메서드·경로 | 주체 | 입력 → 주요 출력 |
|---|---|---|---|
| CO01 | GET /posts, GET /posts/{id} | 로그인 | type,q,cursor → 게시된 공지/팁·제목검색 |
| CO02 | GET /admin/posts, GET /admin/posts/{id} | 운영자 | 필터 → 초안 포함 |
| CO03 | POST /admin/posts, PATCH /admin/posts/{id} | 운영자 | type,title,body,videoLinks,pinned,expectedVersion(수정) → 초안/수정본 |
| CO04 | POST /admin/posts/{id}/images | 운영자 | multipart file,position,expectedVersion → 검증된 이미지ID |
| CO05 | DELETE /admin/posts/{id}/images/{imageId} | 운영자 | expectedVersion → 연결 제거·객체 정리 상태 |
| CO06 | POST /admin/posts/{id}/publication | 운영자 | PUBLISH/UNPUBLISH,expectedVersion → 게시상태 |
| CO07 | GET /posts/{id}/images/{imageId} | 게시물 열람 권한자 | 없음 → 접근검증 후 이미지; 비공개 직접 객체 접근 차단 |
| NT01 | GET /me/notifications | 로그인 | cursor,type → 본인 알림함 |
| NT02 | POST /me/notifications/{id}/read | 본인 | 없음 → 읽음 |
| NT03 | GET /me/notification-preferences, PUT /me/notification-preferences | 본인 | 종류별 pushEnabled,expectedVersion(수정) → 설정 |
| NT04 | POST /me/push-devices | 앱 본인 | platform,token,installationId → 등록ID; 토큰 비노출 |
| NT05 | DELETE /me/push-devices/{id} | 본인 | expectedVersion → 회수 |
| OP01 | GET /admin/dashboard | 운영자 | 없음 → 혼잡·예약·대기·실패 작업·관측 시각 |
| OP02 | GET /gym/calendar | 로그인 | from,to → 운영시간·휴무; 비공개 설정 제외 |
| OP03 | GET /admin/settings, PATCH /admin/settings | 운영자 | 운영시간·혼잡도·휴회한도,reason,expectedVersion → 버전·적용일 |
| OP04 | POST /admin/calendar-overrides | 운영자 | date,운영/휴무,reason → 달력 변경·재판정 영향 |
| OP05 | GET /admin/devices, POST /admin/devices | 운영자+등록 시 재인증 | label → 목록/일회 연결코드 |
| OP06 | POST /device/enrollment | 연결코드 보유기기 | challengeId,code → 제한 기기 자격증명; 일회 소비 |
| OP07 | POST /admin/devices/{id}/revoke | 운영자 | reason,expectedVersion → 즉시회수 |
| OP08 | GET /admin/audit-events | 운영자 | 주체·행위·기간 → 비밀값 없는 최소 이력 |
| OP09 | POST /me/deletion-requests | 본인+재인증 | 정산 별도 안내 확인 → 접수ID·즉시인증회수·접수증(202) |
| OP10 | GET /admin/deletion-requests, GET /admin/deletion-requests/{id} | 운영자 | 상태 → 담당·지연사유·종료조건·자원별 증거 |
| OP11 | POST /admin/deletion-requests/{id}/actions | 전용 개인정보 관리권한 운영자 | 분리보존/실행요청/지연기록,근거,reason,expectedVersion → 작업상태 |
| OP12 | GET /admin/jobs/{id} | 운영자 | 없음 → 재판정/파기/복구대조 작업상태·최소 오류 |

CO04는 JPEG/PNG/WebP 각5MiB·최대5장, 시그니처·재인코딩 검증 후 연결한다. 미검증 객체는 비공개 격리한다. 영상은 HTTPS 링크만, 서버가 임의 URL을 가져오지 않는 기본안이다. 게시 해제 즉시 CO07 접근 차단, 장기 공개 URL을 발급하지 않는다. 게시물 제목1~200자·본문1~20,000자·영상링크 최대5개는 기술 제안이다. 공지 자동 푸시는 없다.

OP03 한도는 신규신청부터 적용하고 기존 승인을 보존한다. OP11은 HTTP 서버에 DB 파기 역할을 부여하는 경로가 아니다. 승인 범위를 전용 작업자로 전달하고 실제 증거를 확인해야 완료한다. 탈퇴 후 인증 없는 개인자료 조회 API는 두지 않으며 접수증·운영자 본인확인 문의로 안내한다.

## 8. 핵심 요청 예시

회원 예약 요청(트레이너 대리 예약은 협의 필드 추가):

```http
POST /api/v1/pt-bookings
Authorization: Bearer <session>
Idempotency-Key: 2bef8a3b-53bf-4f23-b31b-297b05036bdf
Content-Type: application/json

{"memberId":"101","slotId":"901"}
```

```json
{"data":{"id":"7001","status":"CONFIRMED","ptPassId":"501","heldCount":1,"version":1},"meta":{"requestId":"req_example","serverTime":"2026-10-19T03:00:00Z"}}
```

기기 출석 요청은 동일 키·동일 token으로 재조회/재전송한다. 앱 화면의 QR 갱신은 성공 소비와 별개다.

```json
{"qrToken":"<opaque-single-use-value>"}
```

```json
{"data":{"checkInId":"8001","result":"ACCEPTED","attendanceDate":"2026-10-19","displayUntil":"2026-10-19T03:00:05Z"},"meta":{"requestId":"req_device","serverTime":"2026-10-19T03:00:00Z"}}
```

주요 오류: `QR_EXPIRED/QR_USED/DEVICE_REVOKED`、`MEMBERSHIP_INACTIVE/PAUSED/OUTSIDE_HOURS`、`SLOT_CONFLICT/INSUFFICIENT_PT_CREDITS/PT_PASS_EXPIRED/BOOKING_WINDOW_EXCEEDED`、`CHANGE_DEADLINE_PASSED/CONSENT_REQUIRED`、`VERSION_CONFLICT/IDEMPOTENCY_MISMATCH`、`POLICY_NOT_CONFIGURED/REVIEW_REQUIRED`。인증 오류는401/403, 경합은409, 나머지 업무 조건은422를 기본으로 하며 객체 범위 밖은404다.

## 9. 구현 인계 조건

OpenAPI 기계 판독 스키마·각 요청의 필수/선택/null·열거값 전체·계약 테스트는 후속 개발 항목이다. 이 문서는 업무 API 초안이며 실행 가능한 서버나 완성된 OpenAPI로 간주하지 않는다. 기술 제안(세션 전달·재인증5분·본문 길이·연결코드 수명 등)은 개발 착수 시 확정해 스키마에 고정한다. 기기 연결코드는10분·5회 실패 폐기, 사용자 QR·세션과 분리하는 안을 제안한다. 새로운 법률 판단은 추가하지 않으며 보존 근거 확인은 요구사항 §10·12를 따른다.
