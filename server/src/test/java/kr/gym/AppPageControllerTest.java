package kr.gym;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

// [목적] 관리자 경로 직접 접속·새로고침이 공통 앱을 열고 API·정적 파일의 오류를 가리지 않는지 검증합니다.
@WebMvcTest(AppPageController.class)
@Import(WebSecurity.class)
@TestPropertySource(properties={"gym.cookie-secure=false"})
class AppPageControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean AuthService service;
    @Test void administratorRoutesServeTheCommonFrontend() throws Exception {
        for(String path:new String[]{"/entry-qr","/admin","/admin/","/admin/members","/admin/approvals","/admin/memberships","/admin/memberships/","/admin/checkin","/admin/settings"}) {
            var response=mvc.perform(get(path)).andReturn().getResponse();
            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getForwardedUrl()).isEqualTo("/index.html");
        }
    }
    @Test void missingAssetsAndUnknownApisDoNotReturnTheAppShell() throws Exception {
        var asset=mvc.perform(get("/admin/missing.js")).andReturn().getResponse();
        assertThat(asset.getStatus()).isEqualTo(404);
        assertThat(asset.getForwardedUrl()).isNull();
        var api=mvc.perform(get("/api/v1/unknown")).andReturn().getResponse();
        assertThat(api.getStatus()).isEqualTo(401);
        assertThat(api.getForwardedUrl()).isNull();
    }
}
