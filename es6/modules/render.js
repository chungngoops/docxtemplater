const wrapper = require("../module-wrapper");
const { getScopeCompilationError } = require("../errors");
const { utf8ToWord, hasCorruptCharacters } = require("../doc-utils");
const { throwCorruptCharacters } = require("../errors");

const ftprefix = {
	docx: "w",
	pptx: "a",
};

class Render {
	constructor() {
		this.name = "Render";
		this.recordRun = false;
		this.recordedRun = [];
	}
	set(obj) {
		if (obj.compiled) {
			this.compiled = obj.compiled;
		}
		if (obj.data != null) {
			this.data = obj.data;
		}
	}
	getRenderedMap(mapper) {
		return Object.keys(this.compiled).reduce((mapper, from) => {
			mapper[from] = { from, data: this.data };
			return mapper;
		}, mapper);
	}
	optionsTransformer(options, docxtemplater) {
		this.parser = docxtemplater.parser;
		this.fileType = docxtemplater.fileType;
		return options;
	}
	postparse(postparsed) {
		const errors = [];
		postparsed.forEach(p => {
			if (p.type === "placeholder") {
				const tag = p.value;
				try {
					this.parser(tag, { tag: p });
				} catch (rootError) {
					errors.push(getScopeCompilationError({ tag, rootError }));
				}
			}
		});
		return { postparsed, errors };
	}
	recordRuns(part) {
		if (part.tag === `${ftprefix[this.fileType]}:r`) {
			this.recordRun = false;
			this.recordedRun = [];
		} else if (part.tag === `${ftprefix[this.fileType]}:rPr`) {
			if (part.position === "start") {
				this.recordRun = true;
				this.recordedRun = [part.value];
			}
			if (part.position === "end") {
				this.recordedRun.push(part.value);
				this.recordRun = false;
			}
		} else if (this.recordRun) {
			this.recordedRun.push(part.value);
		}
	}
	render(part, { scopeManager, linebreaks, nullGetter }) {
		if (linebreaks) {
			this.recordRuns(part);
		}
		if (part.type === "placeholder" && !part.module) {
			let value = scopeManager.getValue(part.value, { part });
			if (value == null) {
				value = nullGetter(part);
			}
			if (hasCorruptCharacters(value)) {
				throwCorruptCharacters({ tag: part.value, value });
			}
			if (typeof value !== "string") {
				value = value.toString();
			}
			if (linebreaks) {
				const p = ftprefix[this.fileType];
				const br = this.fileType === "docx" ? "<w:r><w:br/></w:r>" : "<a:br/>";
				const lines = value.split("\n");
				const runprops = this.recordedRun.join("");
				return {
					value: lines
						.map(function(line) {
							return utf8ToWord(line);
						})
						.join(`</${p}:t></${p}:r>${br}<${p}:r>${runprops}<${p}:t>`),
				};
			}
			return { value: utf8ToWord(value) };
		}
	}
}

module.exports = () => wrapper(new Render());
