# MEOW 고양이 원본 자산

이 폴더의 네 PNG는 사용자의 기존 MEOW 프로젝트에서 사용하는 **투명 배경 얼굴 자산**을 변경 없이 복사한 것입니다. 새 캐릭터를 만들거나 그림을 다시 편집하지 않았습니다. 2026-11-25 SCYL에 잘못 연결했던 검은 배경 원본을 MEOW의 누끼 PNG로 교체했습니다.

- 원본 생성일: 2026-11-10, 투명 배경 편집일: 2026-11-11
- 기존 제작 기록: MEOW의 docs/meow-cat-assets.md
- 제작 방식: 내장 이미지 생성 도구로 제작하고 같은 도구로 평면 선화 스타일로 정리한 사용자 프로젝트용 이미지
- 원본 기록에 따르면 사람 사진·수집한 품종 사진은 사용하지 않았습니다.
- 원본 경로: MEOW public/cats/map-portraits-{core,a,b,c}-v1.png
- 4개 투명 atlas: map-portraits-core-v1.png(4열·3행, 12개), map-portraits-a-v1.png/map-portraits-b-v1.png/map-portraits-c-v1.png(각 6열·6행, 36개)
- 얼굴 그룹 120개, 같은 그림을 쓰는 변형을 포함한 목록 ID 144개
- 품종·형태에 영감을 받은 일러스트이며 품종 판별용 자료가 아닙니다.

MEOW에서 내장 이미지 생성 도구의 투명 배경 편집으로 제작한 파일 기록:

- core: exec-7b08a065-fc5e-4792-8db8-f0d9488145b0.png
- a: exec-c4d24784-b940-461e-9dd3-8315bdac45d9.png
- b: exec-423bfe94-ec3a-4288-ac6a-291e51517a3c.png
- c: exec-8fe93176-22f7-4c68-9c41-d5725349450b.png

목록과 화면 배치는 MEOW src/data/catBreeds.ts, src/domain/catGroups.ts, src/screens/CatIdentity.tsx를 기준으로 옮겼습니다. 품종명 참조 출처와 2026-11-10 확인일은 lib/companion-catalog.mjs에 보존했습니다. 해당 출처는 그림의 외부 라이선스 출처가 아닙니다.

이번 복사는 동일 사용자가 명시한 MEOW와 SCYL의 동일 프로필 선택기 구현 작업입니다. 기존 프로젝트 기록에서 별도 공개 재배포 라이선스는 확인되지 않았으므로 MIT 등 새 라이선스를 임의로 부여하지 않았습니다. 공개 저장소 전체의 라이선스 선택과는 별개입니다.
