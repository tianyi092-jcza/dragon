"""从可编辑Web内容源生成运行资产（纯离线；游戏本身不需要构建）。"""

import argparse
from pathlib import Path

from content_pipeline import SOURCE_ROOT, compile_content

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE_ROOT)
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="explicit output directory; use a temp directory to compare first",
    )
    args = parser.parse_args()
    try:
        catalog = compile_content(args.source, args.output)
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        parser.exit(1, f"Compile failed: {error}\n")
    print(f"Compiled {catalog['id']} revision {catalog['revision']} to {args.output}")
