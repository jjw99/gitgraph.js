"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
/**
 * Calculate branches paths of the graph.
 *
 * It follows the Command pattern:
 * => a class with a single `execute()` public method.
 *
 * Main benefit is we can split computation in smaller steps without
 * passing around parameters (we can rely on private data).
 */
class BranchesPathsCalculator {
  constructor(
    commits,
    branches,
    commitSpacing,
    isGraphVertical,
    isGraphReverse,
    createDeletedBranch,
  ) {
    this.branchesPaths = new Map();
    this.commits = commits;
    this.branches = branches;
    this.commitSpacing = commitSpacing;
    this.isGraphVertical = isGraphVertical;
    this.isGraphReverse = isGraphReverse;
    this.createDeletedBranch = createDeletedBranch;
  }
  /**
   * Compute branches paths for graph.
   */
  execute() {
    this.fromCommits();
    this.withMergeCommits();
    return this.smoothBranchesPaths();
  }
  /**
   * Initialize branches paths from calculator's commits.
   */
  fromCommits() {
    this.commits.forEach((commit) => {
      let branch = this.branches.get(commit.branchToDisplay);
      if (!branch) {
        // NB: may not work properly if there are many deleted branches.
        branch = this.getDeletedBranchInPath() || this.createDeletedBranch();
      }
      const path = [];
      const existingBranchPath = this.branchesPaths.get(branch);
      const firstParentCommit = this.commits.find(
        ({ hash }) => hash === commit.parents[0],
      );
      if (existingBranchPath) {
        path.push(...existingBranchPath);
      } else if (firstParentCommit) {
        // Make branch path starts from parent branch (parent commit).
        path.push({ x: firstParentCommit.x, y: firstParentCommit.y });
      }
      path.push({ x: commit.x, y: commit.y });
      this.branchesPaths.set(branch, path);
    });
  }
  /**
   * Insert merge commits points into `branchesPaths`.
   *
   * @example
   *     // Before
   *     [
   *       { x: 0, y: 640 },
   *       { x: 50, y: 560 }
   *     ]
   *
   *     // After
   *     [
   *       { x: 0, y: 640 },
   *       { x: 50, y: 560 },
   *       { x: 50, y: 560, mergeCommit: true }
   *     ]
   */
  withMergeCommits() {
    const mergeCommits = this.commits.filter(
      ({ parents }) => parents.length > 1,
    );
    mergeCommits.forEach((mergeCommit) => {
      const parentOnOriginBranch = this.commits.find(({ hash }) => {
        return hash === mergeCommit.parents[1];
      });
      if (!parentOnOriginBranch) return;
      const originBranchName = parentOnOriginBranch.branches
        ? parentOnOriginBranch.branches[0]
        : "";
      let branch = this.branches.get(originBranchName);
      if (!branch) {
        branch = this.getDeletedBranchInPath();
        if (!branch) {
          // Still no branch? That's strange, we shouldn't set anything.
          return;
        }
      }
      const lastPoints = [...(this.branchesPaths.get(branch) || [])];
      this.branchesPaths.set(branch, [
        ...lastPoints,
        { x: mergeCommit.x, y: mergeCommit.y, mergeCommit: true },
      ]);
    });
  }
  /**
   * Retrieve deleted branch from calculator's branches paths.
   */
  getDeletedBranchInPath() {
    return Array.from(this.branchesPaths.keys()).find((branch) =>
      branch.isDeleted(),
    );
  }
  /**
   * Smooth all paths by putting points on each row.
   */
  smoothBranchesPaths() {
    const branchesPaths = new Map();
    this.branchesPaths.forEach((points, branch) => {
      if (points.length <= 1) {
        branchesPaths.set(branch, [points]);
        return;
      }
      // Cut path on each merge commits
      // Coordinate[] -> Coordinate[][]
      if (this.isGraphVertical) {
        points = points.sort((a, b) => (a.y > b.y ? -1 : 1));
      } else {
        points = points.sort((a, b) => (a.x > b.x ? 1 : -1));
      }
      if (this.isGraphReverse) {
        points = points.reverse();
      }
      const paths = points.reduce(
        (mem, point, i) => {
          if (point.mergeCommit) {
            mem[mem.length - 1].push(utils_1.pick(point, ["x", "y"]));
            let j = i - 1;
            let previousPoint = points[j];
            // Find the last point which is not a merge
            while (j >= 0 && previousPoint.mergeCommit) {
              j--;
              previousPoint = points[j];
            }
            // Start a new array with this point
            if (j >= 0) {
              mem.push([previousPoint]);
            }
          } else {
            mem[mem.length - 1].push(point);
          }
          return mem;
        },
        [[]],
      );
      if (this.isGraphReverse) {
        paths.forEach((path) => path.reverse());
      }
      // Add intermediate points on each sub paths
      if (this.isGraphVertical) {
        paths.forEach((subPath) => {
          if (subPath.length <= 1) return;
          const firstPoint = subPath[0];
          const lastPoint = subPath[subPath.length - 1];
          const column = subPath[1].x;
          const branchSize =
            Math.round(
              Math.abs(firstPoint.y - lastPoint.y) / this.commitSpacing,
            ) - 1;
          const branchPoints =
            branchSize > 0
              ? new Array(branchSize).fill(0).map((_, i) => ({
                  x: column,
                  y: subPath[0].y - this.commitSpacing * (i + 1),
                }))
              : [];
          const lastSubPaths = branchesPaths.get(branch) || [];
          branchesPaths.set(branch, [
            ...lastSubPaths,
            [firstPoint, ...branchPoints, lastPoint],
          ]);
        });
      } else {
        paths.forEach((subPath) => {
          if (subPath.length <= 1) return;
          const firstPoint = subPath[0];
          const lastPoint = subPath[subPath.length - 1];
          const column = subPath[1].y;
          const branchSize =
            Math.round(
              Math.abs(firstPoint.x - lastPoint.x) / this.commitSpacing,
            ) - 1;
          const branchPoints =
            branchSize > 0
              ? new Array(branchSize).fill(0).map((_, i) => ({
                  y: column,
                  x: subPath[0].x + this.commitSpacing * (i + 1),
                }))
              : [];
          const lastSubPaths = branchesPaths.get(branch) || [];
          branchesPaths.set(branch, [
            ...lastSubPaths,
            [firstPoint, ...branchPoints, lastPoint],
          ]);
        });
      }
    });
    return branchesPaths;
  }
}
exports.BranchesPathsCalculator = BranchesPathsCalculator;
/**
 * Return a string ready to use in `svg.path.d` from coordinates
 *
 * @param coordinates Collection of coordinates
 */
function toSvgPath(coordinates, isBezier, isVertical) {
  return coordinates
    .map(
      (path) =>
        "M" +
        path
          .map(({ x, y }, i, points) => {
            if (
              isBezier &&
              points.length > 1 &&
              (i === 1 || i === points.length - 1)
            ) {
              const previous = points[i - 1];
              if (isVertical) {
                const middleY = (previous.y + y) / 2;
                return `C ${previous.x} ${middleY} ${x} ${middleY} ${x} ${y}`;
              } else {
                const middleX = (previous.x + x) / 2;
                return `C ${middleX} ${previous.y} ${middleX} ${y} ${x} ${y}`;
              }
            }
            return `L ${x} ${y}`;
          })
          .join(" ")
          .slice(1),
    )
    .join(" ");
}
exports.toSvgPath = toSvgPath;
//# sourceMappingURL=branches-paths.js.map
