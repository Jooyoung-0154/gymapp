package kr.gym;

class ApiError extends RuntimeException {
    final int status;
    final String code;
    ApiError(int status, String code, String message) { super(message); this.status=status; this.code=code; }
    static ApiError invalid(String message) { return new ApiError(422,"INVALID_INPUT",message); }
    static ApiError login() { return new ApiError(401,"LOGIN_FAILED","로그인 정보를 확인해 주세요."); }
}
