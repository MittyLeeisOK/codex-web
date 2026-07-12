"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installModuleAliasHook = installModuleAliasHook;
const node_module_1 = __importDefault(require("node:module"));
const node_path_1 = __importDefault(require("node:path"));
function installModuleAliasHook() {
    const moduleWithLoad = node_module_1.default;
    const originalLoad = moduleWithLoad._load;
    moduleWithLoad._load = function moduleAliasLoad(request, parent, isMain) {
        if (request === "electron") {
            return originalLoad.call(this, node_path_1.default.resolve(node_path_1.default.resolve(__dirname, "../.."), "src/server/electron/compat.js"), parent, isMain);
        }
        return originalLoad.call(this, request, parent, isMain);
    };
}
//# sourceMappingURL=module.js.map