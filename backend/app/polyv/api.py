"""比赛用到的直播开放接口，路径与参数取自帮助中心文档仓库 document-center（注释里是文档路径）。

开工第一件事用测试环境账号逐个验证，通过后在 doc/需求文档.html 第 10 节把状态改成「已验证」。
"""
from .client import PolyvClient


async def channel_info(c: PolyvClient, channel_id: str):
    """查询频道信息：城名、主持人、头图。文档 live/api/v4/channel/operate/get_channel_detail"""
    return await c.get("/live/v4/channel/basic/get", channelId=channel_id)


async def playback_list(c: PolyvClient, channel_id: str, page: int = 1, page_size: int = 20):
    """查询视频库列表 → 回放广场的楼阁；contents[].fileId 用来查大纲。文档 live/api/channel/playback/get_playback_list"""
    return await c.get(f"/live/v2/channel/recordFile/{channel_id}/playback/list", page=page, pageSize=page_size)


async def record_outline(c: PolyvClient, channel_id: str, file_id: str):
    """获取暂存视频大纲：AI 大纲 + 答题内容 → 殿室与宝函。文档 live/api/v4/channel/recordfile/get_record_file_outline"""
    return await c.get("/live/v4/channel/record-file/subtitle/outline/get-by-fileId", channelId=channel_id, fileId=file_id)


async def chat_messages(c: PolyvClient, channel_id: str, start_day: str, end_day: str, page: int = 1, page_size: int = 1000):
    """查询频道聊天记录，日期 yyyy-MM-dd → 书生灯影的高频问题。文档 live/api/chat/message/get_message_list"""
    return await c.get("/live/v3/channel/chat/get-history-page", channelId=channel_id,
                       startDay=start_day, endDay=end_day, page=page, pageSize=page_size)


async def questions(c: PolyvClient, channel_id: str, begin: int = 0, end: int = -1):
    """查询频道提问记录，end=-1 不分页 → 书生灯影。文档 live/api/live_interaction/get_question_list"""
    return await c.get(f"/live/v2/chat/{channel_id}/getQuestion", begin=begin, end=end)


async def view_logs(c: PolyvClient, channel_id: str, start_date: str, end_date: str,
                    viewer_id: str | None = None, page: int = 1, page_size: int = 1000):
    """查询观看记录，起止日期须在同一个月 → 墨雾与朱旗。文档 live/api/v4/user/viewlog/viewlog_list"""
    return await c.get("/live/v4/user/viewlog/list", channelId=channel_id, startDate=start_date, endDate=end_date,
                       viewerId=viewer_id, pageNumber=page, pageSize=page_size)


async def play_logs(c: PolyvClient, channel_id: str, session_id: str, kind: str, start_ms: int, end_ms: int,
                    page: int = 1, page_size: int = 1000):
    """分页查询频道观看日志，一次播放一条，param3 区分 live 直播 / vod 回放，带进出时间。
    文档 live/api/channel/viewdata/viewlog_page"""
    return await c.get(f"/live/v2/statistics/{channel_id}/viewlog", sessionIds=session_id, param3=kind,
                       startTime=start_ms, endTime=end_ms, page=page, pageSize=page_size)


async def record_files(c: PolyvClient, channel_id: str, page: int = 1, page_size: int = 50):
    """分页查询频道直播暂存列表。文档 live/api/v4/channel/recordfile/page_record

    文档没列出 contents[].subtitleList，但接口实际会返回（live-api-aggregate → playback-service RecordFileVO）：
    [{name, srtUrl, language, source, isOriginal, status}]，status 为 finish / publish 时 srtUrl 可下载。
    """
    return await c.get("/live/v4/channel/record-file/list", channelId=channel_id, pageNumber=page, pageSize=page_size)


async def create_record_outline(c: PolyvClient, file_id: str, quiz: bool = True, sync_dot: bool = False):
    """创建暂存视频大纲（触发 AI 看），可同时生成知识测验、回写回放打点。文档 live/api/v4/channel/recordfile/create_record_file_outline"""
    yn = lambda b: "Y" if b else "N"
    return await c.post_json("/live/v4/channel/record-file/subtitle/outline/create",
                             {"fileId": file_id, "aiKnowledgeQuizEnabled": yn(quiz), "syncToPlaybackDotEnabled": yn(sync_dot),
                              "aiSummaryAuditEnabled": "N"})  # 不显式传 N 会停在待审核


def pick_subtitle(record_file: dict) -> dict | None:
    """从暂存文件里挑一份可用字幕：优先原声，其次任意已生成的。"""
    ready = [s for s in record_file.get("subtitleList") or [] if s.get("status") in ("finish", "publish") and s.get("srtUrl")]
    ready.sort(key=lambda s: s.get("isOriginal") != "Y")
    return ready[0] if ready else None


async def quiz_answers(c: PolyvClient, channel_id: str, session_id: str):
    """查询频道答题卡结果：每题 total / correctCount / sendTime → 殿室错误率与 Boss。文档 live/api/live_interaction/get_answer_list"""
    return await c.get("/live/v3/channel/question/answer-records", channelId=channel_id, sessionId=session_id)


async def questionnaire_answers(c: PolyvClient, channel_id: str, session_id: str):
    """查询频道问卷结果（问卷需已结束）。文档 live/api/live_interaction/get_questionnaire_result"""
    return await c.get("/live/v3/channel/questionnaire/answer-records", channelId=channel_id, sessionId=session_id)
