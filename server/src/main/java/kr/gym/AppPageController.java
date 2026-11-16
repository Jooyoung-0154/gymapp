// [목적] 관리자 화면 직접 접속·새로고침을 공통 React 앱으로 연결합니다. API 권한 검사는 WebSecurity가 수행합니다.
package kr.gym;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class AppPageController {
    @GetMapping({"/entry-qr","/entry-qr/","/admin","/admin/","/admin/members","/admin/members/","/admin/approvals","/admin/approvals/","/admin/memberships","/admin/memberships/","/admin/checkin","/admin/checkin/","/admin/settings","/admin/settings/"})
    String adminPage() { return "forward:/index.html"; }
}
