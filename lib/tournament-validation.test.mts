import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeHttpUrl,
  isValidUuid,
  validateTournamentInput,
} from "./tournament-validation.ts";

test("FR-01 validateTournamentInput: chấp nhận thông tin giải hợp lệ", () => {
  const res = validateTournamentInput({
    name: "  Giải Cờ Vua Sinh Viên USCC 2026  ",
    organizer: "HCMUS",
    venue: "Nhà thi đấu Quận 5",
    startDate: "2026-11-01",
    endDate: "2026-11-02",
    totalRounds: 7,
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#172C4C",
  });

  assert.equal(res.valid, true);
  if (res.valid) {
    assert.equal(res.data.name, "Giải Cờ Vua Sinh Viên USCC 2026");
    assert.equal(res.data.totalRounds, 7);
    assert.equal(res.data.logoUrl, "https://example.com/logo.png");
    assert.equal(res.data.primaryColor, "#172C4C");
  }
});

test("FR-01 validateTournamentInput: từ chối tên rỗng hoặc quá 200 ký tự", () => {
  const emptyRes = validateTournamentInput({
    name: "   ",
    totalRounds: 5,
  });
  assert.equal(emptyRes.valid, false);
  if (!emptyRes.valid) {
    assert.equal(emptyRes.errorCode, "TOURNAMENT_NAME_REQUIRED");
  }

  const longRes = validateTournamentInput({
    name: "A".repeat(201),
    totalRounds: 5,
  });
  assert.equal(longRes.valid, false);
  if (!longRes.valid) {
    assert.equal(longRes.errorCode, "TOURNAMENT_NAME_TOO_LONG");
  }
});

test("FR-01 validateTournamentInput: kiểm tra số vòng từ 1 đến 30 và không nhỏ hơn vòng đã nhập", () => {
  const zeroRounds = validateTournamentInput({
    name: "Giải A",
    totalRounds: 0,
  });
  assert.equal(zeroRounds.valid, false);
  if (!zeroRounds.valid) {
    assert.equal(zeroRounds.errorCode, "TOTAL_ROUNDS_OUT_OF_RANGE");
  }

  const tooManyRounds = validateTournamentInput({
    name: "Giải A",
    totalRounds: 31,
  });
  assert.equal(tooManyRounds.valid, false);
  if (!tooManyRounds.valid) {
    assert.equal(tooManyRounds.errorCode, "TOTAL_ROUNDS_OUT_OF_RANGE");
  }

  const belowExisting = validateTournamentInput({
    name: "Giải A",
    totalRounds: 3,
    highestExistingRound: 5,
  });
  assert.equal(belowExisting.valid, false);
  if (!belowExisting.valid) {
    assert.equal(belowExisting.errorCode, "TOTAL_ROUNDS_BELOW_EXISTING_ROUND");
  }
});

test("FR-01 validateTournamentInput: từ chối ngày kết thúc trước ngày bắt đầu", () => {
  const badDates = validateTournamentInput({
    name: "Giải A",
    startDate: "2026-11-05",
    endDate: "2026-11-01",
    totalRounds: 5,
  });
  assert.equal(badDates.valid, false);
  if (!badDates.valid) {
    assert.equal(badDates.errorCode, "INVALID_TOURNAMENT_DATES");
  }
});

test("FR-01 validateTournamentInput & isSafeHttpUrl: chặn javascript: và data: URLs (XSS prevention)", () => {
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeHttpUrl("ftp://files.example.com/logo.png"), false);
  assert.equal(isSafeHttpUrl("https://uscc.vn/logo.svg"), true);
  assert.equal(isSafeHttpUrl("http://localhost:3000/logo.png"), true);

  const xssLogo = validateTournamentInput({
    name: "Giải A",
    totalRounds: 5,
    logoUrl: "javascript:alert(document.cookie)",
  });
  assert.equal(xssLogo.valid, false);
  if (!xssLogo.valid) {
    assert.equal(xssLogo.errorCode, "INVALID_LOGO_URL");
  }
});

test("FR-01 validateTournamentInput: kiểm tra mã màu hex #RRGGBB", () => {
  const badColor = validateTournamentInput({
    name: "Giải A",
    totalRounds: 5,
    primaryColor: "red",
  });
  assert.equal(badColor.valid, false);
  if (!badColor.valid) {
    assert.equal(badColor.errorCode, "INVALID_PRIMARY_COLOR");
  }
});

test("isValidUuid: kiểm tra định dạng UUID hợp lệ và từ chối chuỗi sai", () => {
  assert.equal(isValidUuid("a0000000-0000-4000-8000-000000000001"), true);
  assert.equal(isValidUuid("18428721-6f55-446f-821d-746347991dbb"), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid("18428721-6f55-446f-821d"), false);
  assert.equal(isValidUuid("   18428721-6f55-446f-821d-746347991dbb   "), true);
});


