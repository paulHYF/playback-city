from app.polyv.sign import sign


def test_sign_matches_doc_rule():
    # secret + 非空参数按 key 升序拼接 + secret，MD5 大写；sign 与空值不参与
    params = {"timestamp": "1700000000000", "appId": "abc", "channelId": "3958201", "sign": "x", "empty": ""}
    import hashlib
    expected = hashlib.md5("SappIdabcchannelId3958201timestamp1700000000000S".encode()).hexdigest().upper()
    assert sign(params, "S") == expected
