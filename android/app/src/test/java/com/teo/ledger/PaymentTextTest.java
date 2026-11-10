package com.teo.ledger;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PaymentTextTest {

    @Test
    public void 원으로_쓴_금액을_찾는다() {
        assertTrue(PaymentText.hasAmount("스타벅스에서 5,300원 결제했어요"));
    }

    @Test
    public void 원화_기호로_쓴_금액도_찾는다() {
        assertTrue(PaymentText.hasAmount("₩12,000 결제 완료"));
    }

    @Test
    public void 해외_원화결제의_KRW_금액도_찾는다() {
        assertTrue(PaymentText.hasAmount("해외승인 KRW 20,991.00 11/5 14:59"));
    }

    @Test
    public void 금액이_없으면_결제_알림이_아니다() {
        assertFalse(PaymentText.hasAmount("새 메시지가 도착했어요"));
    }
}
