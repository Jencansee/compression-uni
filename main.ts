import * as asyncFs from 'node:fs/promises';
import inquirer from 'inquirer';
import * as jpeg from 'jpeg-js';
import * as fs from 'node:fs';
import * as Jimp from 'jimp';

class Compressor {
	img?: Jimp;
	quality?: number;
	imgPath: string;

	constructor(imgPath: string, quality?: number) {
		this.imgPath = imgPath;
		this.img;
		this.quality = quality || 70;
	}

	async grayScaleImage() {
		let image = await Jimp.read(this.imgPath);
		this.img = image.grayscale();

		return this.img;
	}

	async getImage() {
		this.img = await Jimp.read(this.imgPath);
		return this.img;
	}

	sizeToMegabytes(
		target: Buffer | string,
		encoding: BufferEncoding = 'utf8'
	) {
		return +Number(Buffer.byteLength(target, encoding) / 1000 ** 2).toFixed(
			4
		);
	}

	comparison(
		initialBuffer: Buffer,
		compressedBuffer: Buffer | string,
		encoding?: BufferEncoding
	) {
		const intialSize = this.sizeToMegabytes(initialBuffer, encoding);
		const resultSize = this.sizeToMegabytes(compressedBuffer, encoding);

		console.log(`Размер исходника: ${intialSize} Mb`);
		console.log(`Размер результата: ${resultSize} Mb`);

		console.log(
			`Сжатие составило ${Number(
				100 - (resultSize / intialSize) * 100
			).toFixed(2)}%`
		);
	}

	/**
	 * Run-length encoding
	 * @param binary '0001100001001111111'
	 * @returns 30 21 40 11 20 71
	 */
	RLEEncoder(binary: string) {
		const imgSpl = binary.split('');

		let encoded = '';

		let currentBit = ''; // just bit
		let count = 1;

		imgSpl.forEach((bit, index) => {
			if (currentBit) {
				if (bit === currentBit) count++;

				if (bit !== currentBit || imgSpl.length === index + 1) {
					encoded += `${count}${currentBit}`;

					currentBit = bit;
					count = 1;
				}

				return;
			}

			currentBit = bit;
		});

		return encoded;
	}

	/**
	 * Lempel–Ziv–Welch lossless compression
	 */
	lzw_encode(s: string) {
		var dict: any = {};
		var data = (s + '').split('');
		var out = [];
		var currChar;
		var phrase = data[0];
		var code = 256;
		for (var i = 1; i < data.length; i++) {
			currChar = data[i];
			if (dict[phrase + currChar] != null) {
				phrase += currChar;
			} else {
				out.push(
					phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0)
				);
				dict[phrase + currChar] = code;
				code++;
				phrase = currChar;
			}
		}
		out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
		for (var i = 0; i < out.length; i++) {
			out[i] = String.fromCharCode(out[i]);
		}
		return out.join('');
	}
}

async function main(algorithm: string, imagePath: string) {
	const compress = new Compressor(imagePath);

	let encoding: BufferEncoding = 'utf8';
	let initialBuffer: Buffer;
	let resultBuffer: Buffer | string;
	let image = await compress.grayScaleImage();

	switch (algorithm) {
		case 'LZW':
			image.getBuffer(image.getMIME(), (err, data) => {
				if (err) throw err;
				return (initialBuffer = data);
			});

			resultBuffer = compress.lzw_encode(initialBuffer.toString('utf8'));
			break;

		case 'RLE':
			encoding = 'hex';

			initialBuffer = image.bitmap.data;
			resultBuffer = compress.RLEEncoder(
				image.bitmap.data.toString('hex')
			);

			break;

		case 'JPEG':
			image.getBuffer(image.getMIME(), (err, startBuffer) => {
				if (err) throw err;
				initialBuffer = startBuffer;

				const compressSettings = {
					width: image.getHeight(),
					height: image.getWidth(),
					data: initialBuffer,
				};

				const { data } = jpeg.encode(
					compressSettings,
					compress.quality
				);

				resultBuffer = data;
			});
			break;

		default:
			throw new Error('Пожалуйтста выберите алгоритм');
	}

	compress.comparison(initialBuffer, resultBuffer, encoding);
}

//* init function
async function init() {
	await inquirer
		.prompt([
			{
				name: 'imagePath',
				message: 'Введите путь к картинке',
			},
		])
		.then(async ({ imagePath }) => {
			try {
				await asyncFs.access(imagePath, fs.constants.F_OK);

				await inquirer
					.prompt([
						{
							name: 'confirmation',
							type: 'confirm',
							message: `Вы выбрали картинку ${imagePath}, продолжить?`,
						},
					])
					.then(async ({ confirmation }) => {
						if (confirmation) {
							const { algorithm } = await inquirer.prompt([
								{
									type: 'list',
									name: 'algorithm',
									message: 'Выберите алгоритм',
									choices: ['LZW', 'RLE', 'JPEG'],
								},
							]);

							main(await algorithm, imagePath);
						} else init();
					});
			} catch (err) {
				console.log(
					'\x1b[31m!\x1b[0m Пожалуйста введите корректный путь'
				);
				init();
			}
		});
}

init();
