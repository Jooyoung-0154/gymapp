// [목적] GymApplication.java 파일: Spring Boot 서버의 진입점입니다. 같은 패키지 아래의 컴포넌트를 탐색하고 내장 웹 서버를 시작합니다.
package kr.gym;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration.class)
public class GymApplication {
    public static void main(String[] args) { SpringApplication.run(GymApplication.class, args); }
}
