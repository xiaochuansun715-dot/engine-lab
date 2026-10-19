# 声音素材致谢 / Audio credits

本 App 的发动机声音由真实录音切成的单个燃烧周期（颗粒）在运行时按物理转速重新拼接而成，放炮（排气回火）播放真实枪声录音的单次瞬态（切在真实起爆点、高通滤波去掉低频、截短并保留自然回声尾巴）。以下是随 App 分发的全部第三方录音。
The engine sounds are built from single combustion cycles cut from real recordings and re-sequenced at run time from the physics; exhaust pops play single recorded gunshot transients (cut at the true onset, high-passed, trimmed with their natural echo tail). All third-party recordings shipped with the app are listed below.

CC BY 4.0 要求在 App 内（如"关于/致谢"页）和随包文件中署名，并说明是否修改。
CC BY 4.0 requires attribution inside the app (About / Credits page) and in the distributed files, including a note on modifications.

## 必须署名 / Attribution required (CC BY 4.0)

| 作品 Title | 作者 Author | 链接 Link | 许可 License | 用在 Used in | 改动 Modifications |
|---|---|---|---|---|---|
| Audi R8 Idling Reving Backfire | Jonas_Jocys | https://freesound.org/people/Jonas_Jocys/sounds/457733/ | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | `Banks/engine-v10.bytes`（V10 发动机周期，也作 V8/V12/直六/水平对置六缸等高转速颗粒） | 从 Freesound 公开试听版（MP3）解码；切成单个发动机周期并标注点火位置；运行时按转速做 PSOLA 重排、变调和响度归一 / decoded from the public preview; cut into single engine cycles with firing marks; re-sequenced, pitch-shifted and level-normalised at run time |
| 1951 Mercury-Turnover and Cold Start | lonemonk | https://freesound.org/people/lonemonk/sounds/62565/ | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | `Banks/oneshots.bytes`（启动马达） | 取 0.02–0.45 s（启动电磁开关）和 1.2–6.8 s（马达带转）两段；带转段首尾交叉淡化成无缝循环；高通 35 Hz；运行时按带转转速变调 / two excerpts (engage 0.02–0.45 s, cranking 1.2–6.8 s); cranking made a seamless loop by a crossfade; 35 Hz high-pass; pitch follows cranking speed at run time |
| Chev 350 start then die | lonemonk | https://freesound.org/people/lonemonk/sounds/123686/ | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | `Banks/oneshots.bytes`（起动机，大排量汽油 V8 用；App 里起动机音量默认为 0，在设置里调高才会听到） | 从 Freesound 公开试听版（MP3）解码；只取发动机点着之前的 0.02–0.43 s（起动机转动），35 Hz 高通，把其中一处约 +10 dB 的撞击声压平，尾部交叉淡化成可循环的片段 / decoded from the public preview; only the 0.02–0.43 s of cranking before the engine fires, 35 Hz high-pass, one clunk levelled, tail cross-faded into a loop |
| shotgun in field 130518_01.wav | klankbeeld | https://freesound.org/people/klankbeeld/sounds/191449/ | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | `Banks/pops.bytes`（放炮 "pop.bang"，1 个） | 从 Freesound 公开试听版（MP3）解码；只取单次枪声：切在真实起爆点（0.4 ms 淡入，去掉 MP3 预回声）、4 阶高通 300–350 Hz、+4 dB 650 Hz 中低频、尾部向背景噪声压低、0.26–0.45 s 淡出、峰值归一；运行时随机选择并变调 ±8 % / decoded from the public preview; single shots cut at the true onset (0.4 ms fade-in removes MP3 pre-echo), 4th-order high-pass at 300–350 Hz, +4 dB at 650 Hz, tail expanded toward the background, 0.26–0.45 s fade-out, peak-normalised; picked at random and pitched ±8 % at run time |

## 公共领域（无署名义务，仍列出）/ Public domain (CC0, listed for traceability)

| 作品 Title | 作者 Author | 链接 Link | 用在 Used in | 改动 Modifications |
|---|---|---|---|---|
| Chevrolet Caprice (motor at different speeds & driving away) | romanholtwick | https://freesound.org/people/romanholtwick/sounds/391671/ | `Banks/engine-v8.bytes`（十字曲轴 V8 怠速到约 1700 rpm 的全部周期） | 公开试听版解码；切周期、按周期对齐排列 / decoded preview; cut and aligned cycles |
| The Dyno Sessions: 190E — 17_MedSweep_D6, 20_6500_D6, 19_2500_D6, 19_500_D6, 21_6500_D6, 21_2500_D6, 21_500_D6 | Chippy569 | https://freesound.org/people/Chippy569/sounds/162504/ , …/162512/ , …/162509/ , …/162506/ , …/162521/ , …/162518/ , …/162515/ | `Banks/engine-i4.bytes`（直列四缸，也作摩托、转子、柴油等的颗粒来源） | 1.3 kHz 以上高架 −11 dB、8 kHz 低通（去掉测功机近场嘶声和风扇噪声）；切周期 / −11 dB high shelf above 1.3 kHz and 8 kHz low-pass (dyno near-field hiss and fan noise); cut into cycles |

| Diesel Start-Idle-Revs MZ000004 | DAVESTALKER | https://freesound.org/people/DAVESTALKER/sounds/443319/ | `Banks/engine-diesel.bytes`（柴油发动机怠速的真实燃烧周期；康明斯、Duramax、单缸拖拉机的低转速颗粒） | 只取 1.0–8.6 s 与 22.6–26.3 s（避开人声）；切周期 / only 1.0–8.6 s and 22.6–26.3 s (no voices); cut into cycles |
| Diesel Start-Idle-Revs MZ000004（起动部分） | DAVESTALKER | https://freesound.org/people/DAVESTALKER/sounds/443319/ | `Banks/oneshots.bytes`（起动机，柴油发动机用） | 只取点着之前的 0.08–0.64 s（起动机转动），35 Hz 高通，按压缩节奏对齐后交叉淡化成可循环的片段 / only the 0.08–0.64 s of cranking, 35 Hz high-pass, looped on its compression beat |
| ignition, engine start, idle, stop, motorcycle, bike, CB400 vtec 3 | AlexanderChe | https://freesound.org/people/AlexanderChe/sounds/362940/ | `Banks/oneshots.bytes`（起动机，摩托车发动机用） | 从 Freesound 公开试听版（MP3）解码；只取点着之前的 7.17–7.72 s（起动机转动），35 Hz 高通，按压缩节奏对齐后交叉淡化成可循环的片段 / decoded from the public preview; only the 7.17–7.72 s of cranking, 35 Hz high-pass, looped on its compression beat |
| shooting_2.ogg | mchrpt | https://freesound.org/people/mchrpt/sounds/660977/ | `Banks/pops.bytes`（放炮 "pop.bang"，5 个削波最少的步枪枪声） | 从 Freesound 公开试听版（MP3）解码；只取单次枪声：切在真实起爆点（0.4 ms 淡入，去掉 MP3 预回声）、4 阶高通 300–350 Hz、+4 dB 650 Hz 中低频、尾部向背景噪声压低、0.26–0.45 s 淡出、峰值归一；运行时随机选择并变调 ±8 % / decoded from the public preview; single shots cut at the true onset (0.4 ms fade-in removes MP3 pre-echo), 4th-order high-pass at 300–350 Hz, +4 dB at 650 Hz, tail expanded toward the background, 0.26–0.45 s fade-out, peak-normalised; picked at random and pitched ±8 % at run time |
| 9mm Pistol Gunshots | DledeSOUND | https://freesound.org/people/DledeSOUND/sounds/731942/ | `Banks/pops.bytes`（放炮 "pop.bang"，2 个） | 同上 / as above |
| Revolver Gunshots | C-V | https://freesound.org/people/C-V/sounds/835200/ | `Banks/pops.bytes`（小爆裂声 "pop.crack"，5 个） | 同上，尾巴 0.26 s，4 kHz 以上 −7 dB / as above, 0.26 s tail, −7 dB shelf above 4 kHz |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

## 只用于分析、没有随 App 分发的录音 / Analysed only, not shipped

lonemonk "Chev350 Raw.wav" / "Chev 350 Rev and Idle"（CC BY 4.0）、Ears68 测功机 V8（CC0，原录音严重削波）、jackthemurray、modusmogulus、Dominik_W、VacekH、kyles、holderall、Henaway、Paul368、florianreichelt、t33kno、ulose2piranha、jerry.berumen、ikbenraar、SkyernAklea、Mihacappy、AlexanderChe、martian、Heigh-hoo、EwanPenman11 的录音只用于频谱对照和素材评估，不在任何 `.bytes` 里。若以后加入，须在此补充署名。完整来源、许可和 SHA-256 见本机 `RawAudio/SOURCES.md`（该目录不进 Git）。

## 合成部分 / Synthesised parts

启动马达的电刷噪声（无录音时的备用）、涡轮啸叫与泄压阀、机械增压器啸叫、柴油敲缸、换挡"咔哒"、熄火抖动、进气声均由本项目代码实时合成（Assets/Scripts/Audio），无第三方素材。
