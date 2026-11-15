// [목적] ApiError.java 파일: 업무 처리 중 발생한 실패를 HTTP 상태·오류 코드·사용자 안내 문구로 전달하는 예외입니다.
package kr.gym;

class ApiError extends RuntimeException {
    final int status;
    final String code;
    ApiError(int status, String code, String message) { super(message); this.status=status; this.code=code; }
    static ApiError invalid(String message) { return new ApiError(422,"INVALID_INPUT",message); }
    // [기능] login 메서드: 로그인을 요청합니다. 회원 앱은 추가 인증이 필요한 운영자와 MEMBER 역할이 없는 계정을 허용하지 않습니다.
    static ApiError login() { return new ApiError(401,"LOGIN_FAILED","로그인 정보를 확인해 주세요."); }
}
