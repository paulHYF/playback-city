"""给库里的测试城写入完整闯关配置（主题、殿室机制与题面、门题与道具链、NPC、Boss），走后台同一个接口，过服务端校验。

数据库不进仓库，重建库后跑一次即可恢复演示配置：
    uv run python seed/seed_worlds.py              # 默认连本机 http://localhost:8000
    PC_API=http://host:8000 uv run python seed/seed_worlds.py
会覆盖这几讲已有的闯关配置（后台「游戏配置」里的人工调整）。
"""
import json
import os
import urllib.error
import urllib.request

API = os.environ.get("PC_API", "http://localhost:8000").rstrip("/") + "/api"

def call(method, path, body=None):
    req = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode(), method=method, headers={'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode()}')

def room(i, name, mechanic, layout='hall', mood='lit', **kw):
    return {'room': i, 'name': name, 'layout': layout, 'mood': mood, 'mechanic': mechanic, **kw}

PAL = {'wall': '#2a3036', 'accent': '#c9a45c', 'fog': 0.16}
WORLDS = {
    # 不夜城营销 · 秋冬好物专场：夜市，一摊一个商品
    'fe8f299eadf1b404214dae952b11e0dd': {
        'theme': 'night_market', 'name': '秋冬夜市', 'palette': PAL,
        'intro': '夜市开张，四样秋冬好物各占一摊。把价格、规则和卖点都记清，才走得出这条街。',
        'rooms': [
            room(0, '牌坊口·优惠榜', 'chest_quiz', 'stall_row', door={'item': 'q02'}, reward='coupon'),
            room(1, '保温杯摊', 'twin_doors', 'stall_row', twin_doors={'prompt': '直接装热水的那层内胆，用的是哪种不锈钢？', 'left': '316 不锈钢', 'right': '304 不锈钢', 'answer': 'left', 'explain': '316 耐腐蚀更好，用在直接接触饮品的内胆；外壳用的是 304。', 'source_time': 70}),
            room(2, '围巾铺', 'beasts', 'courtyard', 'dim', requires='coupon'),
            room(3, '眼罩小摊', 'beasts', 'hall', 'misty', door={'item': 'q12'}, reward='sample'),
            room(4, '咖啡挑子', 'order_steps', 'stall_row', requires='sample', order_steps={'prompt': '挂耳咖啡怎么冲才对？按顺序排', 'steps': ['把水温降到约 92 度', '分三次慢慢注入热水', '总水量注到约 180 毫升'], 'source_time': 336}),
            room(5, '售后柜台', 'calc', 'hall', calc={'prompt': '买一个 500 毫升保温杯（129 元）加一份两件装眼罩（118 元），满 199 减 30 之后到手多少钱？', 'answer': '217 元', 'explain': '129 + 118 = 247 元，满 199 减 30，到手 217 元；满减可以跨商品凑单。', 'source_time': 380}),
        ],
        'items': [{'id': 'coupon', 'name': '凑单券', 'desc': '满 199 减 30，可跨商品凑', 'use': '围巾铺（Boss 殿）凭券入内'},
                  {'id': 'sample', 'name': '试饮签', 'desc': '咖啡挑子的试饮凭证', 'use': '凭签进咖啡挑子'}],
        'boss': {'archetype': 'haggler', 'name': '砍价刁客', 'weakness': '非纯羊绒', 'taunt': '说是羊毛就是羊绒？吊牌一拆，可就退不了了。', 'points': 120},
        'npcs': [{'archetype': 'shop_clerk', 'room': 0, 'faq': 0, 'line': '三位客人问过我：到手价还能不能再叠券？满减能不能跨商品凑？'},
                 {'archetype': 'shop_clerk', 'room': 2, 'faq': 5, 'line': '四个人问过这围巾是不是羊绒——先听听主播怎么说的。'},
                 {'archetype': 'shop_clerk', 'room': 4, 'faq': 9, 'line': '刚烧开的水能不能冲？三个人都问过，水温可有讲究。'}],
        'clock': {'real_minutes': 6},
    },
    # 不夜城培训 · Python 第 3 讲：保留后台已选的古墓主题
    '8ea7a282b7f77c8901af3917969db7ca': {
        'theme': 'tomb', 'name': 'Python 古墓 · 第三讲', 'palette': PAL,
        'intro': '盗洞打开，墓道里摆满了容器。列表、字典、循环，每一间墓室都锁着一个易错点。',
        'rooms': [
            room(0, '墓道入口', 'lamps', 'corridor'),
            room(1, '索引耳室', 'chest_quiz', door={'item': 'q04'}, reward='bronze_key'),
            room(2, '切片甬道', 'code_fill', 'corridor', 'misty', code_fill={'prompt': '取出下标 1 和 2 两个元素', 'code': 'a = [10, 20, 30, 40]\nb = a[___]', 'options': ['1:3', '1:2', '2:3', '0:3'], 'explain': '切片包含起点、不包含终点，a[1:3] 取下标 1 和 2。', 'source_time': 224}),
            room(3, '复制陷阱室', 'twin_doors', requires='bronze_key', door={'item': 'q08'}, reward='lamp_oil', twin_doors={'prompt': 'num = [1, 2]，想把 3、4 逐个加进去得到 [1, 2, 3, 4]，该用哪个？', 'left': 'append', 'right': 'extend', 'answer': 'right', 'explain': 'append 把参数整个塞进去，长度只加 1；extend 拆开逐个加入。', 'source_time': 308}),
            room(4, '主墓室·字典', 'beasts', 'courtyard', 'dim', requires='lamp_oil'),
            room(5, '循环回廊', 'beasts', 'corridor'),
            room(6, '词频碑林', 'order_steps', order_steps={'prompt': '统计每个词出现了几次，步骤按顺序排', 'steps': ['建一个空字典 counts', '遍历每个词 w', 'counts[w] = counts.get(w, 0) + 1', '按次数排序 sorted(..., key=lambda kv: kv[1], reverse=True)'], 'source_time': 717}),
        ],
        'items': [{'id': 'bronze_key', 'name': '青铜钥匙', 'desc': '刻着负数刻度的钥匙', 'use': '开复制陷阱室的墓门'},
                  {'id': 'lamp_oil', 'name': '长明灯油', 'desc': '一小壶长明灯油', 'use': '点亮主墓室，才能进去对决'}],
        'boss': {'archetype': 'tomb_beast', 'name': 'KeyError 镇墓兽', 'weakness': 'get', 'taunt': '取不到的键，就别想过去。', 'points': 120},
        'npcs': [{'archetype': 'scholar_ghost', 'room': 1, 'faq': 0, 'line': '四个人问过我：列表索引为什么从 0 开始？'},
                 {'archetype': 'scholar_ghost', 'room': 3, 'faq': 2, 'line': '六个人在这里问 append 和 extend 到底差在哪。'},
                 {'archetype': 'scholar_ghost', 'room': 4, 'faq': 4, 'line': '七个人倒在 KeyError 前——get 和方括号，到底怎么选？'}],
        'clock': {'real_minutes': 6},
    },
    # 离线样例 · Python 入门第 3 讲：编程课用墨家机关城
    'demo': {
        'theme': 'mohist', 'name': '机关城 · 列表与字典', 'palette': PAL,
        'intro': '墨家机关城里，每一道机关都按 Python 的规矩运转。拧错一处，齿轮就会卡住。',
        'rooms': [
            room(0, '机关城门', 'chest_quiz'),
            room(1, '索引长廊', 'code_fill', 'corridor', door={'item': 'q13'}, reward='gear', code_fill={'prompt': '取出最后一个元素', 'code': "fruits = ['苹果', '香蕉', '葡萄']\nlast = fruits[___]", 'options': ['-1', '3', '0', '-0'], 'explain': '负索引从 -1 开始，-1 就是最后一个；下标 3 已经越界。', 'source_time': 762}),
            room(2, '增删工坊', 'twin_doors', twin_doors={'prompt': 'c = b 之后改 c，b 也跟着变。想让两个列表互不影响，该写哪个？', 'left': 'c = b', 'right': 'c = b.copy()', 'answer': 'right', 'explain': 'c = b 只是给同一个列表起了第二个名字；copy() 才复制出一个新列表。', 'source_time': 1736}),
            room(3, '字典枢纽', 'beasts', 'courtyard', 'dim', requires='gear'),
            room(4, '循环传送带', 'sort', 'stall_row', 'misty'),
            room(5, '词频总装台', 'order_steps', order_steps={'prompt': '统计词频的步骤，按顺序排', 'steps': ['建一个空字典 counts', '遍历每个词', 'counts[w] = counts.get(w, 0) + 1', '按次数排序取最多的'], 'source_time': 3720}),
        ],
        'items': [{'id': 'gear', 'name': '铜齿轮', 'desc': '一枚刻着切片记号的铜齿轮', 'use': '装上它，字典枢纽的机关门才转得动'}],
        'boss': {'archetype': 'tomb_beast', 'name': 'KeyError 机关兽', 'weakness': 'get', 'taunt': '键不在，门就不开。', 'points': 120},
        'npcs': [{'archetype': 'scholar_ghost', 'room': 1, 'faq': 0, 'line': '二十七个人问过我：a[-1] 到底是哪一个？'},
                 {'archetype': 'scholar_ghost', 'room': 3, 'faq': 1, 'line': '三十四人卡在这儿——get 和方括号有什么区别？'}],
        'clock': {'real_minutes': 6},
    },
}

for rid, world in WORLDS.items():
    g = call('GET', f'/replays/{rid}/game')
    saved = call('PUT', f'/replays/{rid}/game', {**g, 'world': world})
    w = saved['world']
    print(f"{rid[:8]} {w['theme']:<12} {w['name']} | 机制 {[r['mechanic'] for r in w['rooms']]} | 道具 {[t['name'] for t in w['items']]} | NPC {len(w['npcs'])}")

# 离线样例还没有整城配置：给一份带更夫的
city = call('GET', '/channels/3958201/city')['city']
city.update(name='机关城 · Python 入门', intro='入夜，墨家机关城的齿轮一圈圈转起来。城里只有一座楼，楼下是这一讲的机关地宫。',
            npcs=[{'replay': 'demo', 'name': '墨者阿衡', 'line': '这一讲最多人卡在 get 和方括号，进楼前先想清楚。'}])
for b in city['buildings']:
    b.update(name='列表字典楼', plaque='机关算尽', kind='tower', blurb='列表、字典、循环，一讲讲透容器')
call('PUT', '/channels/3958201/city', city)
print('3958201 city', call('GET', '/channels/3958201/city')['city']['name'])
