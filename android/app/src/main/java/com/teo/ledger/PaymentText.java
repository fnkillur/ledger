package com.teo.ledger;

import java.util.regex.Pattern;

final class PaymentText {

    // 카드사는 "12,000원", 삼성월렛은 "₩12,000", 해외 원화결제는 "KRW 20,991.00"처럼 쓴다.
    private static final Pattern AMOUNT = Pattern.compile("\\d[\\d,]*\\s*원|[₩￦]\\s*\\d|KRW\\s*\\d");

    private PaymentText() {}

    static boolean hasAmount(String text) {
        return AMOUNT.matcher(text).find();
    }
}
