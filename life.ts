interface Path2D {
	addPath(path: Path2D, transform?: SVGMatrix): void;
}

interface LifeParams {
	height: number,
	width: number,
}

const DPR = window.devicePixelRatio;
const CELL_SIZE = 18;
const CELL_PADDING = 12;
const CELL_COLOR = 'hsl(230, 8%, 32%)';

const EVOLUTION_INTERVAL = 900;
const FPS = 16;

class Cell {
	x: number;
	y: number;
	alive: boolean;
	survives: boolean = false;

	// Last change of cell status (from alive to dead, or from dead to alive)
	timestamp: number = -Infinity;

	constructor(x: number, y: number, alive: boolean) {
		this.x = x;
		this.y = y;
		this.alive = alive;
	}

	getPath(timestamp: number): Path2D {
		const path = new Path2D();
		this.addToPath(path, timestamp);
		path.closePath();
		return path;
	}

	addToPath(path: Path2D, timestamp: number) {
		let radius = 0;
		const d = Math.max(timestamp - this.timestamp, 0);

		if (d >= EVOLUTION_INTERVAL) {
			radius = this.alive ? 0 : CELL_SIZE;
		} else {
			if (this.alive) {
				radius = (1 - d / EVOLUTION_INTERVAL) * CELL_SIZE;
			} else {
				radius = d / EVOLUTION_INTERVAL * CELL_SIZE;
			}
		}

		const x = this.x * (CELL_SIZE + CELL_PADDING);
		const y = this.y * (CELL_SIZE + CELL_PADDING);
		const w = CELL_SIZE;

		if (radius < w / 2) {
			path.moveTo(x + radius, y);
			path.arcTo(x + w, y,     x + w, y + w, radius);
			path.arcTo(x + w, y + w, x,     y + w, radius);
			path.arcTo(x,     y + w, x,     y,     radius);
			path.arcTo(x,     y,     x + w, y,     radius);
			path.arcTo(x + w, y,     x + w, y,     radius);
		} else if (radius <= w) {
			path.moveTo(x + w / 2, y + w / 2);
			path.arc(x + w / 2, y + w / 2, Math.max(0, w - radius), 0, Math.PI * 2);
		}
	}
}

class Life {
	private cells: Cell[];
	private pointer = 0;

	constructor(
		private	width: number,
		private height: number,
	) {
		const totalCells = width * height;

		this.cells = Array(totalCells);

		for (let i = 0; i < totalCells; i++) {
			const cellX = i % width;
			const cellY = Math.floor(i / width);
			const proximity = Math.hypot(cellX - width/2, cellY - height/2);
			this.cells[i] = new Cell(
				cellX,
				cellY,
				(proximity < 9) && (Math.random() < 0.5)
			);
		}
	}

	evaluate() {
		for (let i = 0; i < this.cells.length; i++) {
			const cell = this.cells[i];
			const alives = this.neighbours(i);
			if (cell.alive) {
				if (alives < 2 || alives > 3) {
					cell.survives = false;
				} else {
					cell.survives = true;
				}
			} else {
				if (alives === 3) {
					cell.survives = true;
				} else {
					cell.survives = false;
				}
			}
		}

		for (let i = 0; i < this.cells.length; i++) {
			let cell = this.cells[i];
			if (cell.alive !== cell.survives) {
				cell.timestamp = performance.now();
			}
			cell.alive = cell.survives;
		}
	}

	xytoi(x: number, y: number): number {
		if (x >= 0 && x < this.width
			&& y >= 0 && y < this.height) {
				return y * this.width + x;
			}

			return -1;
	}

	itoxy(i: number): {x: number; y: number} | null {
		const h = this.height;
		const w = this.width;
		const x = i % w;
		const y = Math.floor(i / w)
		if (i < 0 || i >= h * w) return null;
		return {x, y};
	}

	neighbours(i: number): number {
		const h = this.height;
		const w = this.width;
		const cell = this.cells[i];
		const {x, y} = cell;

		let alives = 0;

		const columnLeft = x > 0 ? x-1 : w-1;
		const columnRight = x < w-1 ? x+1 : 0;
		const rowAbove = y > 0 ? y-1 : h-1;
		const rowBelow = y < h-1 ? y+1 : 0;

		const neighbours : {[index: string]: number } = {
			topLeft: this.xytoi(columnLeft, rowAbove),
			top: this.xytoi(x, rowAbove),
			topRight: this.xytoi(columnRight, rowAbove),
			left: this.xytoi(columnLeft, y),
			right: this.xytoi(columnRight, y),
			bottomLeft: this.xytoi(columnLeft, rowBelow),
			bottom: this.xytoi(x, rowBelow),
			bottomRight: this.xytoi(columnRight, rowBelow),
		}

		for (let n in neighbours) {
			alives += +this.cells[neighbours[n]].alive;
		}

		return alives;
	}

	[Symbol.iterator]() {
		return {
			next: () => {
				if (this.pointer < this.cells.length) {
					return {
						done: false,
						value: this.cells[this.pointer++],
					}
				} else {
					this.pointer = 0;
					return {
						done: true,
						value: null,
					}
				}
			}
		}
	}
}

class LifeRenderer {
	static mount(canvas : HTMLCanvasElement) {
		const scale = DPR;
		const width = window.innerWidth
		const height = window.innerHeight;

		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';
		canvas.width = width * scale;
		canvas.height = height * scale;

		const life = new Life(
			Math.ceil(width / (CELL_SIZE + CELL_PADDING)),
			Math.ceil(height / (CELL_SIZE + CELL_PADDING)),
		);

		const cx = canvas.getContext('2d');
		cx.scale(scale, scale);
		cx.fillStyle = CELL_COLOR;

		let lastStep = 0;
		let lastFrame = 0;

		function draw(timestamp: DOMHighResTimeStamp) {
			if ((timestamp - lastFrame) * FPS < 1000) {
				window.requestAnimationFrame(draw)
				return;
			}

			lastFrame = timestamp;

			if (timestamp - lastStep > EVOLUTION_INTERVAL) {
				life.evaluate();
				lastStep = timestamp;
			}

			// Clear the canvas before rendering next frame
			cx.clearRect(0, 0, width, height);

			// Next frame combined path
			const newPath = new Path2D();

			for (let cell of life) {
				cell.addToPath(newPath, timestamp);
			}

			cx.fill(newPath);
			window.requestAnimationFrame(draw)
		}

		window.requestAnimationFrame(draw)
	}
}

LifeRenderer.mount(<HTMLCanvasElement>document.getElementById("canvas"));