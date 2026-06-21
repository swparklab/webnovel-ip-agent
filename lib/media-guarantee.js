"use strict";

/**
 * 흥행 보증 엔진 (Hit Guarantee Engine).
 *
 * "사용자가 개떡같이(빈약·모호·진부) 입력해도, 각 매체에서 무조건 1등·흥행할 퀄리티"를
 * 강제하는 품질 최대화 레이어. 웹소설의 scoringTargetBlock(목표 점수 강제) + reviseBlock
 * (2차 보완) + harnessRefine(생성→비평→보완 루프) 메커니즘을 매체로 옮긴다.
 *
 * 승리 조건(루브릭)은 각 매체 1등작이 공통으로 갖춘 요인을 'PD 페르소나 설계 → 투자심사역
 * 적대검증' 워크플로로 도출해 인코딩했다(애니=1초 키비주얼·시즌 상승 루프·팬덤 연료·제작
 * 실현성, 드라마=high-concept·스타 배역·시즌 질문·미드시즌 반전, 다큐=독점 접근권·법적 송출
 * 생존성, 광고=음소거 생존·비즈니스 목표·플루언트 디바이스, 영화=아이러니 로그라인·인생
 * 캐릭터·시그니처 이미지 등).
 *
 * 3개의 레버:
 *   1) guaranteeTargetBlock — 승리 조건 100% 충족 + 목표 점수를 모든 매체 에이전트 프롬프트에
 *      박아, 1차 생성부터 흥행급을 강제한다(가장 강한 레버). 출고 전 자가 점검까지 강제.
 *   2) buildUpgradeBrief — 약한 입력을 흥행급 '북극성 브리프'로 사전 업그레이드해 주입.
 *   3) scoreGuarantee / 보증서 — 산출물이 승리 조건을 충족했는지 채점하고, 미달 기준을 보완
 *      지시로 환원해 목표 점수까지 재생성 루프를 돈다.
 *
 * ⚠️ 정직성: '문자 그대로의 1등'은 누구도 보장 못 한다(편성·마케팅·경쟁작·타이밍·운). 본
 *    엔진이 '보증'하는 것은 결과가 아니라 과정 — 흥행작 공통의 승리 조건을 100% 충족하도록
 *    강제·검증해 확률을 최대화하고, 충족/미달을 투명히 증명한다. 등급은 결정론 점수와 LLM
 *    심사 점수 중 '보수적(낮은)' 쪽을 대표로 표기한다.
 */

const {
  resolveMedium, resolveFormat, mediumLabel, formatLabel,
  mediumSuccessEquation, mediumStructureTarget, MEDIA,
} = require("./medium");

/**
 * 매체별 흥행 보증 루브릭(PD 설계 → 적대검증).
 *  - signature: 1등작을 만드는 결정적 한 끗.
 *  - hitBar: { first, refined } — 보증은 높은 바여야 한다.
 *  - criteria[]: { key, label, weight(1~5), mustHave, check(판정 신호), upgrade(약할 때), signal(결정론 정규식) }
 *  - upgradeRules[]: 개떡 입력을 흥행급으로 끌어올리는 순차 규칙.
 *  - flop[]: 망하는 전형적 이유.
 */
const HIT_RUBRICS = {
  film: {
    label: "영화",
    signature: "한 줄로 팔리는 아이러니 로그라인 + 한 컷으로 기억되는 시그니처 이미지 + 한 인물로 각인되는 인생 캐릭터, 이 셋이 한 점에서 만난다",
    hitBar: { first: 85, refined: 95 },
    criteria: [
      { key: "ironicLogline", label: "아이러니 로그라인(한 줄로 팔림)", weight: 5, mustHave: true, check: "25단어 이내 한 문장에 구체적 주인공·측정 가능한 목표·그 욕망과 충돌하는 아이러니/대가가 모두 있는가", upgrade: "욕망을 극대화하고, 그걸 정면 배신하는 아이러니(원하는 걸 얻으려면 가장 소중한 걸 걸어야 함)를 강제 주입", signal: /로그라인|한 줄|아이러니|전제|대가/ },
      { key: "iconicLeadRole", label: "배우의 인생 캐릭터(아이코닉 주연)", weight: 5, mustHave: true, check: "주인공이 치명적 결함·모순·아이콘성을 갖고, A급 배우가 욕심낼 연기 쇼케이스 장면이 설계됐는가", upgrade: "치명적 결함 1개 + 잊히지 않는 외형/행동 훅 + 도덕적 회색지대를 주입하고 연기 절정 단독 장면을 박는다", signal: /캐스팅|배역|주연|연기|인생캐릭|결함|도덕적 회색|변신/ },
      { key: "signatureImage", label: "시그니처 이미지(한 컷으로 기억)", weight: 5, mustHave: true, check: "오프닝·파이널 이미지가 수미상관하고, 주제를 대사 아닌 한 컷(색·렌즈·구도)으로 압축했는가", upgrade: "전제를 단 하나의 상징 오브젝트/행동으로 번역하고 색·렌즈·구도를 지정해 오프닝 1컷으로 박는다", signal: /시그니처|오프닝 이미지|파이널 이미지|수미상관|한 컷|미장센|상징/ },
      { key: "midpointReversal", label: "판을 뒤집는 미드포인트", weight: 5, mustHave: true, check: "중간(약 50%)에 전제/목표를 재정의하는 반전이 있고 주인공이 수동→능동으로 전환되는가", upgrade: "표면 목표 아래 진짜 목표/진실을 심고 중간에 그것이 드러나 쫓던 것이 함정이었음을 폭로", signal: /미드포인트|반전|뒤집|전환점|함정|진짜 목표/ },
      { key: "emotionalClimax", label: "감정 절정 카타르시스", weight: 5, mustHave: true, check: "클라이맥스가 외적 목표와 내적 변화를 동시에 해소하고 '올 이즈 로스트→절정' 낙차가 명확하며 연출값이 지정됐는가", upgrade: "클라이맥스 직전 모든 걸 잃는 정적 비트로 낙차를 만들고 외적 승부·내적 깨달음을 같은 장면에 합본(음악 빠짐→절정)", signal: /절정|클라이맥스|카타르시스|올 이즈 로스트|감정/ },
      { key: "openingHook", label: "첫 10분 콜드오픈 훅", weight: 4, mustHave: true, check: "오프닝 10분이 톤 선언+주인공 욕망+중심 질문을 동시에 걸고 설명 나열로 시작하지 않는가", upgrade: "세계관 설명형 오프닝을 '주인공이 욕망 때문에 곤경에 빠지는 단일 사건'으로 교체", signal: /콜드 ?오픈|오프닝|첫 (장면|컷|10분)|인 메디아스 레스|중심 질문/ },
      { key: "talkableEnding", label: "여운·토크어빌리티 라스트신", weight: 4, mustHave: true, check: "라스트신이 주제를 이미지로 닫고 관객이 친구에게 옮길 한 장면/한 줄(반전·여운)이 설계됐는가", upgrade: "예상은 배신하되 인과는 만족시키는 마지막 비틀기/수미상관을 설계하고 옮길 한 장면을 명시", signal: /라스트신|엔딩|여운|수미상관|입소문|토크/ },
      { key: "freshness", label: "신선도·차별점(잊히지 않음)", weight: 4, mustHave: true, check: "동종 최근작과 구별되는 한 줄 차별점이 있고 클리셰를 의식적으로 뒤집은 지점이 있는가", upgrade: "뻔한 표면 아래 장르 규칙을 깨는 단일 변수를 주입하고 동종 흥행작 대비 차별 한 줄을 강제", signal: /차별|신선|독창|비틀|기시감|X meets Y/ },
    ],
    upgradeRules: [
      "로그라인을 25단어 이내 high-concept으로 압축하고, 욕망을 배신하는 아이러니/대가를 박는다.",
      "주인공에 치명적 결함 + 외형/행동 훅 + 도덕적 회색을 주입해 '배우가 욕심낼 인생 캐릭터'로 만든다.",
      "전제를 단 하나의 시그니처 이미지(색·렌즈·구도)로 번역해 오프닝·라스트 수미상관으로 박는다.",
      "중간에 판을 뒤집는 미드포인트를 심고 클라이맥스에 '올 이즈 로스트→절정' 낙차를 만든다.",
      "동종 흥행작 대비 차별 한 줄을 강제하고 예고편에 넣을 셋피스 1개를 키운다.",
    ],
    flop: ["로그라인이 약해 한 줄로 안 팔림(마케팅·입소문 불가)", "인생 캐릭터 부재로 캐스팅이 안 붙고 회자가 안 됨", "craft는 통과했는데 신선함이 없어 '유능하지만 잊히는' 영화", "미드포인트 부재로 2막이 늘어짐", "엔딩이 허무(데우스 엑스 마키나)해 평점·입소문이 식음"],
  },

  drama: {
    label: "드라마/OTT",
    signature: "1초에 설명되는 high-concept 위에 한 줄 시즌 질문을 얹고, 스타가 욕심낼 주연과 밈이 되는 시그니처 세트피스로 '재생 버튼'부터 이기는 것",
    hitBar: { first: 86, refined: 94 },
    criteria: [
      { key: "highConcept", label: "0초 프리미스 후크(high-concept)", weight: 5, mustHave: true, check: "로그라인이 25단어 이내이고 '아는 장르+낯선 비틀기'로 듣는 순간 결말이 궁금한가", upgrade: "익숙한 장르 1개에 판 뒤집는 제약/세계규칙 1개를 충돌시켜 high-concept으로 압축", signal: /로그라인|한 줄|프리미스|high-?concept|0초|낯선 (룰|규칙|제약)/ },
      { key: "starRole", label: "스타가 욕심낼 주연 배역", weight: 5, mustHave: true, check: "주연에 극단적 감정 진폭+도덕적 회색지대가 있어 연기 쇼케이스가 되는가", upgrade: "가면과 무너지는 본모습의 격차 + 공감하나 동의 못 할 선택 + 1회 정체성 전복을 부여", signal: /캐스팅|배역|주연|연기 진폭|쇼케이스|도덕적 회색|정체성 전복/ },
      { key: "seasonQuestion", label: "시즌 관통 질문(한 줄 미스터리)", weight: 5, mustHave: true, check: "시즌 질문 한 문장이 명시되고 모든 회차가 그에 답/미룸/뒤집기로 연결되는가", upgrade: "주인공이 가장 원하는 것+가장 큰 장애를 단일 질문('~는 ~를 이룰 수 있는가')으로 강제 변환", signal: /시즌 질문|관통|미스터리|단일 질문|시즌 아크/ },
      { key: "coldOpenHook", label: "1화 콜드오픈 5분 후크", weight: 5, mustHave: true, check: "1화가 설명이 아니라 통념을 흔드는 사건/플래시포워드로 시작하고 5분 내 프리미스·시즌 질문이 감지되는가", upgrade: "가장 충격적 결과 장면을 1화 맨 앞 플래시포워드로 떼어 '어쩌다 여기까지'를 질문으로 깐다", signal: /콜드 ?오픈|오프닝|첫 (5분|장면)|인 메디아스 레스|플래시포워드/ },
      { key: "episodeCliff", label: "화별 훅 + 끝 클리프행어", weight: 5, mustHave: true, check: "각 회차에 오프닝 훅+엔딩 클리프행어가 있고 클리프행어가 시즌 질문을 다음 화로 미루는가", upgrade: "각 화 후반에 '안다고 믿던 사실'을 뒤집는 폭로를 의무 배치하고 정보 공개 직전에서 끊는다", signal: /클리프행어|절단|다음 화|회차 끝|폭로|컷 직전/ },
      { key: "characterDesire", label: "캐릭터 욕망·결핍 선명도", weight: 5, mustHave: true, check: "주연 각자 want/need/wound가 한 문장씩 정의되고 매 화 선택이 이 욕망에서 나오는가", upgrade: "주인공에 '절대 포기 못 하는 단 하나'와 '그걸 위해 넘는 도덕적 선'을 부여해 욕망을 위험하게", signal: /욕망|want|need|결핍|wound|관계|동력/ },
      { key: "antagonistForce", label: "주인공과 동급의 적", weight: 4, mustHave: true, check: "주인공에 맞먹/우위인 적이 자기 논리로 매 화 주인공을 코너로 모는가", upgrade: "정보·권력·자원 우위 + 일부 공감 가능한 동기 + 주인공이 아끼는 걸 정확히 칠 능력을 부여", signal: /대적자|빌런|반대세력|동급|적|코너로|이길 수도/ },
      { key: "signatureSetpiece", label: "시그니처·밈 가능 세트피스(바이럴)", weight: 4, mustHave: true, check: "5초 클립/스틸로 잘려 SNS에 퍼질 시그니처 세트피스가 최소 1개 설계됐는가", upgrade: "낯선 규칙이 가장 잔혹하게 작동하는 시각적 각인 장면을 시그니처로 만든다", signal: /시그니처|밈|짤|바이럴|클립|세트피스|SNS|캡처/ },
    ],
    upgradeRules: [
      "익숙한 장르에 판 뒤집는 룰 1개를 충돌시켜 25단어 high-concept 로그라인을 만든다.",
      "주인공이 가장 원하는 것+가장 큰 장애를 단일 시즌 질문으로 강제 변환한다.",
      "1화를 충격 결과 장면(플래시포워드)으로 열고 매 화 끝을 폭로 직전 클리프행어로 잠근다.",
      "주연에 감정 진폭+도덕적 회색을 부여해 스타가 욕심낼 배역으로 만든다.",
      "5초 클립으로 퍼질 시그니처 세트피스 1개와 미드시즌 대반전을 설계한다.",
    ],
    flop: ["프리미스가 한 줄로 안 끌려 재생 버튼이 안 눌림", "주연이 평면적이라 톱 캐스팅·마케팅 부스트 실패", "메커닉은 채웠는데 '봐야 할 이유(프리미스·배역·밈)'가 없어 평작", "적이 약해 판돈·클리프행어가 공허", "클리프행어로 끌고 결말이 용두사미라 완주율·시즌2 붕괴"],
  },

  documentary: {
    label: "다큐멘터리",
    signature: "카메라만의 독점 접근권으로 결과 모르는 한 인물을 추적하며, 관객 자기 진영의 통념까지 흔드는 단 하나의 명제 — '저 방에 카메라가 있다는 사실' 자체가 사건이 된다",
    hitBar: { first: 82, refined: 93 },
    criteria: [
      { key: "logThesis", label: "한 줄 논점(통념 전복, 내 편도 찌름)", weight: 5, mustHave: true, check: "'___라는 통념이 사실은 ___'가 한 줄로 명시되고 예상 관객층이 이미 믿는 것까지 흔드는가(일방 규탄이면 미달)", upgrade: "통념 1개를 뒤집되 '관객도 공범/오해했던 지점'을 명제에 박고 전 시퀀스를 한 줄에 종속", signal: /논점|명제|통념|전복|한 줄|사실은/ },
      { key: "verifiedAccess", label: "독점 접근권(확보 증거까지)", weight: 5, mustHave: true, check: "결과 모르는 중심 인물을 시간 축으로 추적하고, 독점 장면의 확보 방법(누가 왜 동의하나)까지 설계됐는가", upgrade: "'가장 비싼 대가를 치르는 한 사람'을 캐스팅하고 끝나지 않은 행동을 부여 + 접근 가능 이유를 1줄 명시", signal: /접근권|독점|인물 추적|동의|내부|현장|취재원|결과 모르/ },
      { key: "legalSurvival", label: "법적·윤리적 송출 생존성", weight: 5, mustHave: true, check: "주장별 출처가 있고 '단정/추정/주장'이 구분되며 실명 비판에 반론 슬롯·민감대상 동의가 구성에 있는가", upgrade: "단정문을 확정(자료)/추정(정황)/주장(발언) 3단계로 분류하고 실명 비판마다 반론 슬롯을 의무 삽입", signal: /출처|검증|반론|확정|추정|주장|초상권|명예훼손|동의|법적/ },
      { key: "openingDestabilizer", label: "통념 흔드는 오프닝 한 방", weight: 4, mustHave: true, check: "1번 시퀀스가 설명이 아니라 통념을 흔드는 구체 장면/질문으로 시작하고 논점과 직결되는가(OTT면 90초 내 충격)", upgrade: "논점에서 가장 충격적인 단일 사실/이미지를 콜드오픈으로 전진 배치('당신이 ___라 믿는 이 장면은 사실 ___')", signal: /콜드 ?오픈|오프닝|첫 (3분|90초|장면)|충격|통념을 흔/ },
      { key: "arcReversal", label: "내러티브 아크 + 중반 전환 사실", weight: 4, mustHave: true, check: "'믿음→균열→재정의' 상승 아크가 있고 중반에 인식을 뒤집는 전환 사실 비트가 명시됐는가", upgrade: "정보 나열을 '처음 믿는 것→흔드는 증거→새 진실' 3단 아크로 재배열하고 중반 전환 비트를 1개 의무 배치", signal: /아크|믿음|균열|재정의|전환 사실|뒤집|반전/ },
      { key: "emotionalTruth", label: "감정적 진실(침묵·여백·클로즈업)", weight: 4, mustHave: true, check: "침묵을 견디는 장면·인터뷰 클로즈업+현장음 등 감정 비트가 구체적이고 감정 곡선이 시퀀스별로 매핑됐는가", upgrade: "중심 인물의 가장 취약한 순간을 침묵+클로즈업+현장음으로 연출하고 내레이션을 절반으로 줄인다", signal: /감정|진실|침묵|여백|클로즈업|현장음|울림|공감/ },
      { key: "marketableHook", label: "한 줄 마케팅 훅·키비주얼", weight: 4, mustHave: true, check: "스포일러 없이 궁금증 유발하는 한 줄 로그라인+대표 키비주얼 1컷이 명시됐는가(제목·썸네일·30초 예고로 환원 가능)", upgrade: "논점에서 가장 믿기 어려운 사실/강렬한 이미지를 의문형 로그라인으로 만들고 반복 노출할 키비주얼 1컷 지정", signal: /마케팅 훅|키비주얼|썸네일|로그라인|제목|예고/ },
      { key: "restraintEnding", label: "절제된 엔딩·행동을 부르는 여백", weight: 3, mustHave: true, check: "엔딩이 교훈 내레이션으로 닫히지 않고 질문/선택을 남기며 오프닝과 수미상관하는가", upgrade: "결론 내레이션을 삭제하고 관객이 스스로 답하게 하는 마지막 한 장면/질문으로 교체", signal: /절제|여백|성찰|수미상관|질문을 남|행동/ },
    ],
    upgradeRules: [
      "통념 1개를 뒤집되 '관객 자신도 공범/오해한 지점'을 명제에 박는다(일방 규탄 금지).",
      "결과 모르는 한 인물을 캐스팅하고 독점 장면의 '확보 가능 이유'를 1줄씩 명시한다.",
      "모든 단정을 확정/추정/주장 3단계로 분류하고 실명 비판마다 반론 슬롯을 넣는다.",
      "가장 충격적 단일 사실을 콜드오픈으로 전진 배치하고 중반에 전환 사실을 박는다.",
      "한 줄 마케팅 훅과 반복 키비주얼 1컷을 지정해 '한 줄·한 이미지'로 팔리게 한다.",
    ],
    flop: ["논점이 한 줄로 안 잡혀 '결국 무슨 얘기'로 끝남", "명제가 반대 진영 비난에 그쳐 활동가 영상으로 격하", "접근권을 의도만 적고 확보 증거가 없어 망상/뉴스 재편집", "출처 없는 단정·반론 부재로 법적 리스크로 송출 무산", "한 줄·한 이미지로 안 팔려 추천 피드에서 묻힘"],
  },

  advertising: {
    label: "광고",
    signature: "소리 없이도·스크롤 속에서도·법적으로도 살아남으며, 캠페인 내내 반복되는 단 하나의 소유 가능한 장치(fluent device)로 1초 안에 브랜드를 결착시킨다",
    hitBar: { first: 86, refined: 95 },
    criteria: [
      { key: "objectiveFit", label: "비즈니스 목표·퍼널 정합", weight: 5, mustHave: true, check: "단일 비즈니스 목표(인지/고려/전환/충성 중 1)와 측정 지표가 한 줄로 특정되고 모든 비트가 그를 향하는가('양다리'면 실패)", upgrade: "예산·런타임·플랫폼으로 역산해 단일 목표를 강제 지정(소액·숏폼=전환, 대형=인지)하고 둘이면 1개만 남긴다", signal: /목표|인지|전환|고려|충성|KPI|지표|퍼널/ },
      { key: "soundOff", label: "음소거·자막 생존성", weight: 5, mustHave: true, check: "오디오 0에서도 후크·메시지·브랜드·CTA가 시각/자막/그래픽만으로 전달되는가(반전이 음성에만 걸리면 실패)", upgrade: "음성 의존 비트를 온스크린 텍스트·시각 메타포·자막으로 이중화하고 음소거 버전 컷을 별도 명시", signal: /음소거|자막|소리 (꺼|없)|온스크린|무음에서도|시각만/ },
      { key: "threeSecondHook", label: "3초 정지 후크(stop-the-scroll)", weight: 5, mustHave: true, check: "첫 컷이 설정샷이 아니라 패턴 파괴(역설·미스터리·즉각 긴장)이고 0~3초에 '왜?'가 생기는가", upgrade: "'가장 당연한 첫 장면'의 정반대를 첫 컷으로 강제하고 결과를 먼저 보여주는 인 메디아스 레스로 연다", signal: /3초|첫 컷|후크|stop|패턴 파괴|시선|스크롤/ },
      { key: "brandInOneSecond", label: "1초 브랜드 결착", weight: 5, mustHave: true, check: "브랜드를 바꿔도 성립하면 실패. 후크/반전이 '제품이 결핍을 푸는 순간'과 일치하고 식별 자산이 첫 5초에 등장하는가", upgrade: "제품의 대체 불가한 진실 1줄을 정의해 후크·클라이맥스를 그 위에 얹고 식별 자산을 오프닝·중간·CTA 3지점 반복", signal: /브랜드|제품|식별 자산|distinctive|로고|사운드 로고|결착/ },
      { key: "singleMessage", label: "단일 메시지 결착", weight: 5, mustHave: true, check: "남길 단 한 문장이 1개로 떨어지고 모든 컷·카피·CTA가 그를 향하는가(셀링포인트 3개 병렬이면 실패)", upgrade: "효익을 다 적은 뒤 '하나만 남긴다면?'으로 1개만 남기고 8단어 이내 카피로 고정", signal: /단일 메시지|한 (문장|가지)|하나만|8단어/ },
      { key: "fluentDevice", label: "소유 가능한 플루언트 디바이스", weight: 4, mustHave: true, check: "핵심 장치(시그니처 장면·캐릭터·포맷·사운드·카피 구조)가 다음 편/다른 제품에 이식돼도 같은 브랜드로 읽히는가", upgrade: "후크·결착 장치를 반복 가능한 공식으로 추상화하고 시리즈 2·3편 변주를 한 줄로 명시", signal: /플루언트|반복 자산|시그니처 장치|캠페인|시리즈|이식|공식/ },
      { key: "emotionPeak", label: "감정·유머 임팩트 정점", weight: 4, mustHave: true, check: "명확한 감정 피크(빵 터지거나·울컥·소름)가 1개 특정되고 타깃 결핍이 압축된 공감 장면이 있는가", upgrade: "타깃의 진짜 페인포인트를 한 줄로 적고 룰 오브 쓰리/반전 펀치라인 또는 작은 디테일 한 컷으로 정점을 설계", signal: /감정|유머|울컥|소름|펀치라인|공감|페인포인트|정점/ },
      { key: "ctaShare", label: "명확한 CTA + 공유 방아쇠", weight: 4, mustHave: true, check: "한 줄 CTA+식별 자산이 있고 '친구에게 보낼 이유(밈·공감·놀라움)'가 한 줄 설계됐는가", upgrade: "8단어 이내 행동 카피+사운드 로고를 고정하고 공유 방아쇠(따라할 동작·밈 포맷·태그)를 명시", signal: /CTA|행동|공유|밈|해시태그|사운드 로고|따라하/ },
    ],
    upgradeRules: [
      "예산·플랫폼으로 단일 비즈니스 목표(인지/전환)를 역산해 못 박고 양다리를 자른다.",
      "음성 의존 비트를 자막·온스크린 텍스트로 이중화해 음소거에서도 성립시킨다.",
      "가장 당연한 첫 장면의 정반대를 첫 컷으로 만들어 3초 정지 후크를 박는다.",
      "제품의 대체 불가 진실을 첫 5초에 결착하고 셀링포인트를 1개로 줄인다.",
      "반복 가능한 플루언트 디바이스(사운드 로고·시그니처 장면)와 공유 방아쇠를 설계한다.",
    ],
    flop: ["비즈니스 목표가 모호해 craft에도 지표 0(심사 1순위 탈락)", "후크·반전이 사운드에 걸려 음소거 시청자 80%에 미작동", "가로 16:9 한 편만 만들어 세로 숏폼·세이프존 불일치로 도달 붕괴", "첫 3초를 로고 인트로로 날려 스킵", "브랜드가 후반 CTA에만 있어 무명 광고(뱀파이어 크리에이티브)"],
  },

  animation: {
    label: "애니메이션",
    signature: "1초 키비주얼 한 장 → 흥얼거려지는 OP 후크 → 회자되는 그 장면(sakuga)을 한 캐릭터 자력으로 묶어, 본편 보기 전에 '갖고 싶다'를 만들고 매 화 더 큰 상승 루프로 굴려 굿즈·밈으로 자가증식시킨다",
    hitBar: { first: 85, refined: 94 },
    criteria: [
      { key: "keyVisual", label: "1초 키비주얼(플레이 전 승리)", weight: 5, mustHave: true, check: "포스터/썸네일 단일 정지컷 1장으로 (1)주인공 (2)장르·톤 (3)'이게 뭐지' 호기심이 동시에 읽히고 텍스트 없이 실루엣·색으로 식별되는가", upgrade: "메인 1명을 '시그니처 색+이질적 소품+한 동작'으로 포스터 컷 1장으로 설계하고 한 끗 위화감을 박는다", signal: /키비주얼|썸네일|포스터|한 장|정지컷|메인 ?컷|실루엣|한 끗/ },
      { key: "escalationLoop", label: "반복 상승 루프(시즌 엔진)", weight: 5, mustHave: true, check: "'매 화 전 화보다 무엇이 더 세지는가' 1줄 공식이 있고 12화까지 변주될 축이 2개 이상이며 매 화 끝 상승 절단이 있는가", upgrade: "핵심 능력/관계로 '매 화 더 센 상대+능력의 새 면+관계 1눈금' 3축 반복을 강제하고 4·8·12화에 상승 분기점 배치", signal: /상승 ?루프|매 화|반복 공식|더 (센|강한)|아크|판을 키우|시즌 엔진|4화|8화|12화/ },
      { key: "characterMagnetism", label: "캐릭터 자력(소유 욕망)", weight: 5, mustHave: true, check: "메인 2~3명 각각 식별자+한 줄 결핍/욕망+'최애' 한 끗(갭모에·시그니처 포즈)이 있고 굿즈 한 컷이 떠오르는가", upgrade: "결핍 1개+정반대 갭+시각 식별자+시그니처 행동으로 최애 후보 3명을 만들고 각자 키비주얼 컷을 붙인다", signal: /캐릭터|디자인|실루엣|매력|최애|갭모에|굿즈/ },
      { key: "firstEpHook", label: "1화 이탈 방어 후크", weight: 5, mustHave: true, check: "오프닝 90초 내 충격/의문 비트가 있고 1화 끝이 절단이며 시즌 관통 질문이 던져졌는가", upgrade: "1화 끝에 판 뒤집는 반전을 강제하고 콜드오픈을 결과 먼저(인 메디아스 레스)로 재배열", signal: /1화|후크|클리프행어|콜드 ?오픈|90초|반전/ },
      { key: "sakugaMoment", label: "작화 폭발 명장면(그 장면)", weight: 5, mustHave: true, check: "1화당 최소 1개, 클라이맥스에 작화 밀도가 폭발하는 컷이 콘티 단위(카메라·이펙트·모션)로 설계되고 클립으로 잘릴 장면이 특정되는가", upgrade: "감정 절정 1장면을 '무음→폭발'로 증폭하고 변신/각성/일격 등 시각적 카타르시스 비트를 1개 삽입", signal: /작화|사쿠가|임팩트 컷|폭발|그 장면|무음|클립/ },
      { key: "fandomFuel", label: "팬덤 연료(관계·짤·떡밥)", weight: 4, mustHave: true, check: "관계 텐션(시핑·라이벌·의리) 1개+밈으로 잘릴 과장 컷 1개+시즌 관통 떡밥 1개가 의도적으로 심겼는가", upgrade: "메인 2명 사이에 오해/비대칭 감정/라이벌 의리 1개를 주입하고 1화에 밈 후보 컷+시즌 떡밥 대사 1줄을 삽입", signal: /관계|시핑|라이벌|밈|짤|떡밥|복선|페어/ },
      { key: "productionFeasibility", label: "제작 실현성(콘티로 떨어지는가)", weight: 4, mustHave: true, check: "사쿠가가 회당 1~2컷 집중으로 배분되고 핵심 컷이 콘티 단위 지시이며 캐릭터 디자인이 반복 작화 가능한 복잡도인가", upgrade: "사쿠가를 회당 핵심 1컷 집중+나머지는 정적/뱅크컷으로 재배분하고 식별자를 실루엣·색 2~3요소로 단순화", signal: /콘티|회당|뱅크컷|작화 예산|반복 작화|디자인 단순|실현/ },
      { key: "worldHook", label: "세계관 후크(한 컷 설명)", weight: 4, mustHave: true, check: "콜드오픈에 세계 룰 1줄+시각화 1컷이 있고 룰 위반 시 대가가 명시됐는가", upgrade: "친숙한 베이스에 한 끗 비틀기(마법학교+마법이 수명을 깎는다)를 강제하고 룰을 1컷으로 환원해 오프닝 이미지로", signal: /세계관|세계 룰|규칙|한 컷|대가|비틀/ },
    ],
    upgradeRules: [
      "가장 먼저 '1초 키비주얼'(시그니처 색+이질적 소품+한 동작+한 끗 위화감)을 강제 설계한다.",
      "메인 2~3명을 결핍/갭/식별자/시그니처 행동으로 '최애 후보'로 만들고 각자 키비주얼 컷을 붙인다.",
      "'매 화 더 센 상대+능력의 새 면+관계 전진' 3축 상승 루프를 1줄 공식으로 박고 4·8·12화 분기점을 둔다.",
      "관계 텐션+밈 컷+시즌 떡밥으로 팬덤 자가증식 연료를 심고 클라이맥스 직전 '무음→주제가 진입'을 박는다.",
      "사쿠가를 회당 1~2컷 집중으로 배분하고 디자인을 단순화해 제작 실현성을 확보한다(허세 콘티 금지).",
    ],
    flop: ["키비주얼/썸네일에서 이미 져 본편 도달 자체가 안 됨(플레이 전 0초 패배)", "1화만 화려하고 상승 루프가 없어 3~4화에 동력이 꺼짐", "캐릭터는 매력 있는데 관계·밈·떡밥이 없어 SNS 자가증식 안 됨", "사쿠가 과밀로 작화붕괴·제작 파탄", "회자될 '그 장면'이 없어 잘 만든 평작"],
  },

  webnovel: {
    label: "웹소설",
    signature: "1화에 잃을 것이 분명하고, 회차마다 눈에 보이는 보상이 터지는 사이다 구조",
    hitBar: { first: 80, refined: 90 },
    criteria: [
      { key: "deficit", label: "1화 결핍·부당함", weight: 5, mustHave: true, check: "1화에 주인공이 잃을 것이 분명한가", upgrade: "결핍과 부당한 사건을 1화 첫 장면에 박기", signal: /결핍|부당|잃/ },
      { key: "privilege", label: "주인공 특권(특수성)", weight: 5, mustHave: true, check: "주인공만의 무기가 3화 안에 보이는가", upgrade: "회귀·시스템·원작 지식 등 특권을 조기 공개", signal: /특권|특수|회귀|시스템|각성/ },
      { key: "reward", label: "수치화된 즉시 보상", weight: 5, mustHave: true, check: "레벨·등급·지위·호감 등 보상이 수치로 보이는가", upgrade: "회차마다 눈에 보이는 수치·관계 보상을 박기", signal: /레벨|등급|점수|랭킹|지위|호감|보상/ },
      { key: "agency", label: "주인공 능동성", weight: 4, mustHave: true, check: "주인공이 판을 바꾸는 능동적 선택을 하는가", upgrade: "관찰자 대신 직접 판을 바꾸는 선택을 추가", signal: /선택|나섰|뒤집|결심|움직였/ },
      { key: "cliff", label: "날카로운 절단", weight: 4, mustHave: false, check: "회차 끝이 다음 화를 부르는 절단인가", upgrade: "회차 끝을 새 위협·질문의 클리프행어로", signal: /절단|클리프행어|다음 화|예고/ },
      { key: "loop", label: "반복 루프", weight: 3, mustHave: false, check: "20화 이상 돌릴 사건 생성 구조가 있는가", upgrade: "회차 사건을 만드는 반복 루프를 설계", signal: /반복|루프|사이클/ },
    ],
    upgradeRules: [
      "1화 첫 장면에 결핍·부당함을 박고 3화 안에 특권을 공개한다.",
      "회차마다 수치·관계 보상을 눈에 보이게 박는다.",
      "주인공을 관찰자가 아니라 판을 바꾸는 행위자로 만든다.",
    ],
    flop: ["1화부터 설정 설명이 길다", "보상이 추상적이다", "주인공이 관찰자에 머문다", "반복 루프가 없다"],
  },
};

function hitRubric(medium) {
  return HIT_RUBRICS[resolveMedium(medium)] || HIT_RUBRICS.webnovel;
}

const _sumWeight = (r) => r.criteria.reduce((a, c) => a + c.weight, 0);
const _mustCount = (r) => r.criteria.filter((c) => c.mustHave).length;

/**
 * 흥행 보증 목표 블록 — 모든 매체 에이전트 프롬프트에 박는다.
 * 승리 조건 100% 충족 + 목표 점수 + 출고 전 자가 점검을 강제한다.
 */
function guaranteeTargetBlock(medium, format, { target } = {}) {
  const r = hitRubric(medium);
  const bar = r.hitBar;
  const t = target || bar.first;
  const must = r.criteria.filter((c) => c.mustHave);
  const nice = r.criteria.filter((c) => !c.mustHave);
  const line = (c) => `- ${c.mustHave ? "🔒 [필수]" : "◇"} **${c.label}**(가중치 ${c.weight}) — ${c.check}`;
  return [
    `[🏆 흥행 보증 목표 — ${r.label} 흥행작의 '승리 조건'을 100% 충족하고 자체 보증 점수 ${t}점(1차 ≥${bar.first}, 보완 ≥${bar.refined}) 이상을 달성한다]`,
    `- 결정적 한 끗(시그니처): ${r.signature}`,
    `- 성공 방정식: ${mediumSuccessEquation(medium)}`,
    ``,
    `🔒 필수 승리 조건(하나라도 빠지면 흥행 불가 — 입력이 빈약·모호·진부해도 비워두지 말고 흥행작 수준으로 적극 창작해 반드시 채운다):`,
    must.map(line).join("\n"),
    nice.length ? `\n◇ 가산 승리 조건(많이 충족할수록 1등에 근접):` : "",
    nice.length ? nice.map(line).join("\n") : "",
    ``,
    `[개떡 입력을 흥행급으로 끌어올리는 강제 원칙]`,
    `- 빈약하면: 위 승리 조건 기준으로 흥행작 수준의 구체값(컷·수치·연출값)을 적극 창작해 채운다.`,
    `- 진부하면: 클리셰에 '한 끗 비틀기(정반대 제약·대가·장르 충돌)'를 더해 차별점을 박는다.`,
    `🚫 다음 실패는 절대 범하지 않는다: ${r.flop.slice(0, 5).join(" · ")}.`,
    ``,
    `(출고 전 자가 점검 — 아래 필수 항목을 모두 ✅ 한 뒤에만 결과물을 출력한다)`,
    must.map((c) => `□ ${c.label} 충족?`).join("\n"),
    `→ 하나라도 □면 그 항목을 채운 뒤 다시 점검한다. 충족 시 결과물만 출력(메타 발언 금지).`,
  ].filter(Boolean).join("\n");
}

/** 약한 입력 → 흥행급 '북극성 브리프' 사전 업그레이드 프롬프트. */
function buildUpgradeBrief(input, medium, format) {
  const r = hitRubric(medium);
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const seed = [
    input.ipTitle && `제목: ${input.ipTitle}`,
    input.logline && `로그라인: ${input.logline}`,
    input.sfPremise && `명제: ${input.sfPremise}`,
    input.protagonist && `인물: ${input.protagonist}`,
    input.centralConflict && `갈등: ${input.centralConflict}`,
    input.coreTech && `소재: ${input.coreTech}`,
  ].filter(Boolean).join("\n") || "(거의 비어 있음 — 아이디어 수준)";
  const system = `너는 ${mediumLabel(m)} 흥행 닥터다. 빈약·모호·진부할 수 있는 입력을, 그 매체 흥행작 수준의 '북극성 브리프'로 강하게 업그레이드한다. 원래 씨앗(제목·소재·인물)은 보존하되, 흥행 승리 조건을 모두 만족하도록 과감히 끌어올린다.
- 결정적 한 끗(시그니처): ${r.signature}

[${mediumLabel(m)} 승리 조건 — 아래를 모두 충족하도록 설계한다]
${r.criteria.map((c) => `- ${c.label}: ${c.check}`).join("\n")}

[입력 업그레이드 규칙 — 순서대로 강제 적용]
${r.upgradeRules.map((x, i) => `${i + 1}. ${x}`).join("\n")}

[절대 피할 실패]
${r.flop.map((x) => `- ${x}`).join("\n")}

[출력 — 한국어 Markdown, 간결하게]
## 흥행급 한 줄
- 이 매체 0초 후크 기준에 맞는 강한 전제 한 줄.
## 필수 승리 조건 충족 설계
- 각 필수 조건을 이 작품에서 어떻게 충족할지 한 줄씩(빠짐없이).
## 차별점 한 끗
- 진부함을 비튼 결정적 차별점 한 줄 + 그것을 어디에 박는지.
## 흥행 자산 시드
- 자가증식 자산(애니=최애 후보·밈 컷·시즌 떡밥 / 드라마=캐스팅 피치·시그니처 세트피스 / 광고=사운드로고·태그라인 / 영화=시그니처 이미지·셋피스 / 다큐=키비주얼·마케팅 훅) 각 한 줄.
## 감정/연출 북극성
- 끌어낼 핵심 감정 + 시그니처 연출 한 줄(구체값 1개 포함).

원래 씨앗을 절대 버리지 말고, 위 형식으로 흥행급 북극성 브리프만 출력한다.`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}

[현재 입력 — 빈약/진부할 수 있음]
${seed}

위 입력을 ${mediumLabel(m)} 흥행작 수준의 북극성 브리프로 업그레이드하라.`;
  return { system, user };
}

/** 업그레이드 브리프(또는 보완 지시)를 에이전트에 주입할 블록. */
function upgradeBriefBlock(brief) {
  const s = String(brief || "").trim();
  if (!s) return "";
  return `[🧭 흥행급 북극성 브리프 — 이 방향을 최우선으로 삼아 모든 산출물을 흥행급으로 끌어올린다]\n${s.slice(0, 2400)}`;
}

/** 보완 지시 주입 블록(보증 루프 재생성 시). */
function reviseNotesBlock(notes) {
  const s = String(notes || "").trim();
  if (!s) return "";
  return `[🔧 흥행 보증 보완 지시 — 아래 미달 항목을 이번에 반드시 채워 목표 점수를 넘긴다]\n${s.slice(0, 2000)}`;
}

/**
 * 결정론적 보증 점수 — 각 승리 조건 신호를 탐지해 가중 합산(0~100).
 * 필수(mustHave) 미충족 시 강한 감점(필수가 5개 이상이면 -10/건, 아니면 -12/건).
 */
function scoreGuarantee(text, medium) {
  const r = hitRubric(medium);
  const t = String(text || "");
  const total = _sumWeight(r);
  const penalty = _mustCount(r) >= 5 ? 10 : 12;
  let earned = 0;
  const met = [], missing = [];
  let mustMissing = 0;
  for (const c of r.criteria) {
    const hit = c.signal ? c.signal.test(t) : false;
    if (hit) { earned += c.weight; met.push(c.label); }
    else { missing.push(c.label); if (c.mustHave) mustMissing += 1; }
  }
  let score = total ? Math.round((earned / total) * 100) : 0;
  score = Math.max(0, score - mustMissing * penalty);
  const bar = r.hitBar;
  const grade = score >= bar.refined ? "흥행 보증" : score >= bar.first ? "흥행권" : score >= 60 ? "보완 필요" : "재설계 권장";
  return { score, met, missing, mustMissing, grade, bar, total, earned };
}

/** 미달 승리 조건 → 보완 지시문(보증 루프에서 다음 재생성에 주입). */
function guaranteeReviseNote(medium, scoreObj) {
  const r = hitRubric(medium);
  const miss = (scoreObj.missing || []);
  if (!miss.length) return "";
  const byLabel = Object.fromEntries(r.criteria.map((c) => [c.label, c]));
  const lines = miss.map((label) => {
    const c = byLabel[label];
    return c ? `- ${c.mustHave ? "[필수] " : ""}${c.label}: ${c.upgrade}` : `- ${label} 보강`;
  });
  return [
    `목표 보증 점수 ${r.hitBar.refined}점 이상(현재 ${scoreObj.score}점). 아래 미달 승리 조건을 이번 재생성에서 반드시 채운다.`,
    ...lines,
  ].join("\n");
}

/* ---------------------------- 흥행 보증서 (LLM) ---------------------------- */
function buildGuaranteePrompt({ input, medium, format, digest }) {
  const r = hitRubric(medium);
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const critList = r.criteria.map((c) => `- "${c.key}" (${c.label}, 가중치${c.weight}${c.mustHave ? ", 필수" : ""}): ${c.check}`).join("\n");
  const keys = r.criteria.map((c) => `"${c.key}": { "met": true/false, "score": 0~100, "note": "충족/미달 근거 한 줄" }`).join(",\n    ");
  const system = `너는 ${mediumLabel(m)} 투자·편성·페스티벌 본심 수준의 냉정한 심사위원이다. 아래 '${mediumLabel(m)} 흥행 승리 조건'을 기준으로 산출물이 흥행작의 조건을 충족했는지 정직하게 채점한다. 후하게 주지 마라.

[승리 조건]
${critList}

[채점 원칙]
- 각 조건의 충족(met)·점수(0~100)·근거를 매긴다. 필수 조건 미충족은 치명적이다.
- overall(0~100)은 가중 평균에 가깝게. grade는 정직하게(흥행 보증 / 흥행권 / 보완 필요 / 재설계 권장).
- guaranteedClaims: 이 산출물이 '구조적으로 보증'하는 흥행 요소만(과장 금지).
- gaps: 아직 미달이라 보강해야 할 것. nextActions: 1등으로 끌어올릴 구체 행동 3~5개.
- 오직 JSON 하나만. 코드펜스·설명 금지.

{
  "overall": 0~100,
  "grade": "흥행 보증 / 흥행권 / 보완 필요 / 재설계 권장 중 하나",
  "criteria": {
    ${keys}
  },
  "guaranteedClaims": ["구조적으로 보증되는 흥행 요소 3~5개"],
  "gaps": ["아직 미달이라 보강할 것 2~4개"],
  "nextActions": ["1등으로 끌어올릴 구체 행동 3~5개"],
  "verdict": "한 줄 총평(정직하게)"
}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}
작품: ${String(input.ipTitle || "무제").trim()}

## [산출물 발췌 — 기획~연출 설계]
${String(digest || "").slice(0, 40000)}

위 ${mediumLabel(m)} 산출물의 '흥행 보증서'를 작성하라.`;
  return { system, user };
}

function parseGuarantee(text, medium) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const r = hitRubric(medium);
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fb; };
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  const criteria = {};
  r.criteria.forEach((c) => {
    const e2 = obj.criteria?.[c.key] || {};
    criteria[c.key] = { label: c.label, mustHave: c.mustHave, met: Boolean(e2.met), score: num(e2.score, e2.met ? 80 : 40), note: String(e2.note || "") };
  });
  return {
    overall: num(obj.overall, 0),
    grade: String(obj.grade || "").trim() || "보완 필요",
    criteria,
    guaranteedClaims: arr(obj.guaranteedClaims),
    gaps: arr(obj.gaps),
    nextActions: arr(obj.nextActions),
    verdict: String(obj.verdict || "").trim(),
    bar: r.hitBar,
  };
}

/** 결정론 폴백 보증서(키 없을 때) — scoreGuarantee 기반. */
function localGuarantee(input, medium, format, digest) {
  const r = hitRubric(medium);
  const sg = scoreGuarantee(digest, medium);
  const criteria = {};
  r.criteria.forEach((c) => {
    const met = sg.met.includes(c.label);
    criteria[c.key] = { label: c.label, mustHave: c.mustHave, met, score: met ? 82 : 45, note: met ? "신호 충족(추정)" : "신호 미탐지 — 보강 필요" };
  });
  return {
    overall: sg.score,
    grade: sg.grade,
    criteria,
    guaranteedClaims: sg.met.slice(0, 5).map((x) => `${x} 충족(신호 기반 추정)`),
    gaps: sg.missing.slice(0, 4),
    nextActions: r.criteria.filter((c) => sg.missing.includes(c.label)).slice(0, 5).map((c) => c.upgrade),
    verdict: `결정론 추정 ${sg.score}/100 (${sg.grade}). 실제 보증 심사는 키/구독 연결 시 정밀해집니다.`,
    bar: r.hitBar,
    fallback: true,
  };
}

module.exports = {
  HIT_RUBRICS, hitRubric,
  guaranteeTargetBlock, buildUpgradeBrief, upgradeBriefBlock, reviseNotesBlock,
  scoreGuarantee, guaranteeReviseNote,
  buildGuaranteePrompt, parseGuarantee, localGuarantee,
};
