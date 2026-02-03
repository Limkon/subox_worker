var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

var require_js_yaml_min = __commonJS({
  "src/utils/js-yaml.min.js"(exports, module) {
    !function(e, t) {
      "object" == typeof exports && "undefined" != typeof module ? t(exports) : "function" == typeof define && define.amd ? define(["exports"], t) : t((e = "undefined" != typeof globalThis ? globalThis : e || self).jsyaml = {});
    }(exports, function(e) {
      "use strict";
      function t(e2) {
        return null == e2;
      }
      var n = { isNothing: t, isObject: function(e2) {
        return "object" == typeof e2 && null !== e2;
      }, toArray: function(e2) {
        return Array.isArray(e2) ? e2 : t(e2) ? [] : [e2];
      }, repeat: function(e2, t2) {
        var n2, i2 = "";
        for (n2 = 0; n2 < t2; n2 += 1) i2 += e2;
        return i2;
      }, isNegativeZero: function(e2) {
        return 0 === e2 && Number.NEGATIVE_INFINITY === 1 / e2;
      }, extend: function(e2, t2) {
        var n2, i2, r2, o2;
        if (t2) for (n2 = 0, i2 = (o2 = Object.keys(t2)).length; n2 < i2; n2 += 1) e2[r2 = o2[n2]] = t2[r2];
        return e2;
      } };
      function i(e2, t2) {
        var n2 = "", i2 = e2.reason || "(unknown reason)";
        return e2.mark ? (e2.mark.name && (n2 += 'in "' + e2.mark.name + '" '), n2 += "(" + (e2.mark.line + 1) + ":" + (e2.mark.column + 1) + ")", !t2 && e2.mark.snippet && (n2 += "\n\n" + e2.mark.snippet), i2 + " " + n2) : i2;
      }
      function r(e2, t2) {
        Error.call(this), this.name = "YAMLException", this.reason = e2, this.mark = t2, this.message = i(this, false), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = new Error().stack || "";
      }
      r.prototype = Object.create(Error.prototype), r.prototype.constructor = r, r.prototype.toString = function(e2) {
        return this.name + ": " + i(this, e2);
      };
      var o = r;
      function a(e2, t2, n2, i2, r2) {
        var o2 = "", a2 = "", l2 = Math.floor(r2 / 2) - 1;
        return i2 - t2 > l2 && (t2 = i2 - l2 + (o2 = " ... ").length), n2 - i2 > l2 && (n2 = i2 + l2 - (a2 = " ...").length), { str: o2 + e2.slice(t2, n2).replace(/\t/g, "\u2192") + a2, pos: i2 - t2 + o2.length };
      }
      function l(e2, t2) {
        return n.repeat(" ", t2 - e2.length) + e2;
      }
      var c = function(e2, t2) {
        if (t2 = Object.create(t2 || null), !e2.buffer) return null;
        t2.maxLength || (t2.maxLength = 79), "number" != typeof t2.indent && (t2.indent = 1), "number" != typeof t2.linesBefore && (t2.linesBefore = 3), "number" != typeof t2.linesAfter && (t2.linesAfter = 2);
        for (var i2, r2 = /\r?\n|\r|\0/g, o2 = [0], c2 = [], s2 = -1; i2 = r2.exec(e2.buffer); ) c2.push(i2.index), o2.push(i2.index + i2[0].length), e2.position <= i2.index && s2 < 0 && (s2 = o2.length - 2);
        s2 < 0 && (s2 = o2.length - 1);
        var u2, p2, f2 = "", d2 = Math.min(e2.line + t2.linesAfter, c2.length).toString().length, h2 = t2.maxLength - (t2.indent + d2 + 3);
        for (u2 = 1; u2 <= t2.linesBefore && !(s2 - u2 < 0); u2++) p2 = a(e2.buffer, o2[s2 - u2], c2[s2 - u2], e2.position - (o2[s2] - o2[s2 - u2]), h2), f2 = n.repeat(" ", t2.indent) + l((e2.line - u2 + 1).toString(), d2) + " | " + p2.str + "\n" + f2;
        for (p2 = a(e2.buffer, o2[s2], c2[s2], e2.position, h2), f2 += n.repeat(" ", t2.indent) + l((e2.line + 1).toString(), d2) + " | " + p2.str + "\n", f2 += n.repeat("-", t2.indent + d2 + 3 + p2.pos) + "^\n", u2 = 1; u2 <= t2.linesAfter && !(s2 + u2 >= c2.length); u2++) p2 = a(e2.buffer, o2[s2 + u2], c2[s2 + u2], e2.position - (o2[s2] - o2[s2 + u2]), h2), f2 += n.repeat(" ", t2.indent) + l((e2.line + u2 + 1).toString(), d2) + " | " + p2.str + "\n";
        return f2.replace(/\n$/, "");
      }, s = ["kind", "multi", "resolve", "construct", "instanceOf", "predicate", "represent", "representName", "defaultStyle", "styleAliases"], u = ["scalar", "sequence", "mapping"];
      var p = function(e2, t2) {
        if (t2 = t2 || {}, Object.keys(t2).forEach(function(t3) {
          if (-1 === s.indexOf(t3)) throw new o('Unknown option "' + t3 + '" is met in definition of "' + e2 + '" YAML type.');
        }), this.options = t2, this.tag = e2, this.kind = t2.kind || null, this.resolve = t2.resolve || function() {
          return true;
        }, this.construct = t2.construct || function(e3) {
          return e3;
        }, this.instanceOf = t2.instanceOf || null, this.predicate = t2.predicate || null, this.represent = t2.represent || null, this.representName = t2.representName || null, this.defaultStyle = t2.defaultStyle || null, this.multi = t2.multi || false, this.styleAliases = function(e3) {
          var t3 = {};
          return null !== e3 && Object.keys(e3).forEach(function(n2) {
            e3[n2].forEach(function(e4) {
              t3[String(e4)] = n2;
            });
          }), t3;
        }(t2.styleAliases || null), -1 === u.indexOf(this.kind)) throw new o('Unknown kind "' + this.kind + '" is specified for "' + e2 + '" YAML type.');
      };
      function f(e2, t2) {
        var n2 = [];
        return e2[t2].forEach(function(e3) {
          var t3 = n2.length;
          n2.forEach(function(n3, i2) {
            n3.tag === e3.tag && n3.kind === e3.kind && n3.multi === e3.multi && (t3 = i2);
          }), n2[t3] = e3;
        }), n2;
      }
      function d(e2) {
        return this.extend(e2);
      }
      d.prototype.extend = function(e2) {
        var t2 = [], n2 = [];
        if (e2 instanceof p) n2.push(e2);
        else if (Array.isArray(e2)) n2 = n2.concat(e2);
        else {
          if (!e2 || !Array.isArray(e2.implicit) && !Array.isArray(e2.explicit)) throw new o("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
          e2.implicit && (t2 = t2.concat(e2.implicit)), e2.explicit && (n2 = n2.concat(e2.explicit));
        }
        t2.forEach(function(e3) {
          if (!(e3 instanceof p)) throw new o("Specified list of YAML types (or a single Type object) contains a non-Type object.");
          if (e3.loadKind && "scalar" !== e3.loadKind) throw new o("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
          if (e3.multi) throw new o("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }), n2.forEach(function(e3) {
          if (!(e3 instanceof p)) throw new o("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        });
        var i2 = Object.create(d.prototype);
        return i2.implicit = (this.implicit || []).concat(t2), i2.explicit = (this.explicit || []).concat(n2), i2.compiledImplicit = f(i2, "implicit"), i2.compiledExplicit = f(i2, "explicit"), i2.compiledTypeMap = function() {
          var e3, t3, n3 = { scalar: {}, sequence: {}, mapping: {}, fallback: {}, multi: { scalar: [], sequence: [], mapping: [], fallback: [] } };
          function i3(e4) {
            e4.multi ? (n3.multi[e4.kind].push(e4), n3.multi.fallback.push(e4)) : n3[e4.kind][e4.tag] = n3.fallback[e4.tag] = e4;
          }
          for (e3 = 0, t3 = arguments.length; e3 < t3; e3 += 1) arguments[e3].forEach(i3);
          return n3;
        }(i2.compiledImplicit, i2.compiledExplicit), i2;
      };
      var h = d, g = new p("tag:yaml.org,2002:str", { kind: "scalar", construct: function(e2) {
        return null !== e2 ? e2 : "";
      } }), m = new p("tag:yaml.org,2002:seq", { kind: "sequence", construct: function(e2) {
        return null !== e2 ? e2 : [];
      } }), y = new p("tag:yaml.org,2002:map", { kind: "mapping", construct: function(e2) {
        return null !== e2 ? e2 : {};
      } }), b = new h({ explicit: [g, m, y] });
      var A = new p("tag:yaml.org,2002:null", { kind: "scalar", resolve: function(e2) {
        if (null === e2) return true;
        var t2 = e2.length;
        return 1 === t2 && "~" === e2 || 4 === t2 && ("null" === e2 || "Null" === e2 || "NULL" === e2);
      }, construct: function() {
        return null;
      }, predicate: function(e2) {
        return null === e2;
      }, represent: { canonical: function() {
        return "~";
      }, lowercase: function() {
        return "null";
      }, uppercase: function() {
        return "NULL";
      }, camelcase: function() {
        return "Null";
      }, empty: function() {
        return "";
      } }, defaultStyle: "lowercase" });
      var v = new p("tag:yaml.org,2002:bool", { kind: "scalar", resolve: function(e2) {
        if (null === e2) return false;
        var t2 = e2.length;
        return 4 === t2 && ("true" === e2 || "True" === e2 || "TRUE" === e2) || 5 === t2 && ("false" === e2 || "False" === e2 || "FALSE" === e2);
      }, construct: function(e2) {
        return "true" === e2 || "True" === e2 || "TRUE" === e2;
      }, predicate: function(e2) {
        return "[object Boolean]" === Object.prototype.toString.call(e2);
      }, represent: { lowercase: function(e2) {
        return e2 ? "true" : "false";
      }, uppercase: function(e2) {
        return e2 ? "TRUE" : "FALSE";
      }, camelcase: function(e2) {
        return e2 ? "True" : "False";
      } }, defaultStyle: "lowercase" });
      function w(e2) {
        return 48 <= e2 && e2 <= 55;
      }
      function k(e2) {
        return 48 <= e2 && e2 <= 57;
      }
      var C = new p("tag:yaml.org,2002:int", { kind: "scalar", resolve: function(e2) {
        if (null === e2) return false;
        var t2, n2, i2 = e2.length, r2 = 0, o2 = false;
        if (!i2) return false;
        if ("-" !== (t2 = e2[r2]) && "+" !== t2 || (t2 = e2[++r2]), "0" === t2) {
          if (r2 + 1 === i2) return true;
          if ("b" === (t2 = e2[++r2])) {
            for (r2++; r2 < i2; r2++) if ("_" !== (t2 = e2[r2])) {
              if ("0" !== t2 && "1" !== t2) return false;
              o2 = true;
            }
            return o2 && "_" !== t2;
          }
          if ("x" === t2) {
            for (r2++; r2 < i2; r2++) if ("_" !== (t2 = e2[r2])) {
              if (!(48 <= (n2 = e2.charCodeAt(r2)) && n2 <= 57 || 65 <= n2 && n2 <= 70 || 97 <= n2 && n2 <= 102)) return false;
              o2 = true;
            }
            return o2 && "_" !== t2;
          }
          if ("o" === t2) {
            for (r2++; r2 < i2; r2++) if ("_" !== (t2 = e2[r2])) {
              if (!w(e2.charCodeAt(r2))) return false;
              o2 = true;
            }
            return o2 && "_" !== t2;
          }
        }
        if ("_" === t2) return false;
        for (; r2 < i2; r2++) if ("_" !== (t2 = e2[r2])) {
          if (!k(e2.charCodeAt(r2))) return false;
          o2 = true;
        }
        return !(!o2 || "_" === t2);
      }, construct: function(e2) {
        var t2, n2 = e2, i2 = 1;
        if (-1 !== n2.indexOf("_") && (n2 = n2.replace(/_/g, "")), "-" !== (t2 = n2[0]) && "+" !== t2 || ("-" === t2 && (i2 = -1), t2 = (n2 = n2.slice(1))[0]), "0" === n2) return 0;
        if ("0" === t2) {
          if ("b" === n2[1]) return i2 * parseInt(n2.slice(2), 2);
          if ("x" === n2[1]) return i2 * parseInt(n2.slice(2), 16);
          if ("o" === n2[1]) return i2 * parseInt(n2.slice(2), 8);
        }
        return i2 * parseInt(n2, 10);
      }, predicate: function(e2) {
        return "[object Number]" === Object.prototype.toString.call(e2) && e2 % 1 == 0 && !n.isNegativeZero(e2);
      }, represent: { binary: function(e2) {
        return e2 >= 0 ? "0b" + e2.toString(2) : "-0b" + e2.toString(2).slice(1);
      }, octal: function(e2) {
        return e2 >= 0 ? "0o" + e2.toString(8) : "-0o" + e2.toString(8).slice(1);
      }, decimal: function(e2) {
        return e2.toString(10);
      }, hexadecimal: function(e2) {
        return e2 >= 0 ? "0x" + e2.toString(16).toUpperCase() : "-0x" + e2.toString(16).toUpperCase().slice(1);
      } }, defaultStyle: "decimal", styleAliases: { binary: [2, "bin"], octal: [8, "oct"], decimal: [10, "dec"], hexadecimal: [16, "hex"] } }), x = new RegExp("^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
      var I = /^[-+]?[0-9]+e/;
      var S = new p("tag:yaml.org,2002:float", { kind: "scalar", resolve: function(e2) {
        return null !== e2 && !(!x.test(e2) || "_" === e2[e2.length - 1]);
      }, construct: function(e2) {
        var t2, n2;
        return n2 = "-" === (t2 = e2.replace(/_/g, "").toLowerCase())[0] ? -1 : 1, "+-".indexOf(t2[0]) >= 0 && (t2 = t2.slice(1)), ".inf" === t2 ? 1 === n2 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY : ".nan" === t2 ? NaN : n2 * parseFloat(t2, 10);
      }, predicate: function(e2) {
        return "[object Number]" === Object.prototype.toString.call(e2) && (e2 % 1 != 0 || n.isNegativeZero(e2));
      }, represent: function(e2, t2) {
        var i2;
        if (isNaN(e2)) switch (t2) {
          case "lowercase":
            return ".nan";
          case "uppercase":
            return ".NAN";
          case "camelcase":
            return ".NaN";
        }
        else if (Number.POSITIVE_INFINITY === e2) switch (t2) {
          case "lowercase":
            return ".inf";
          case "uppercase":
            return ".INF";
          case "camelcase":
            return ".Inf";
        }
        else if (Number.NEGATIVE_INFINITY === e2) switch (t2) {
          case "lowercase":
            return "-.inf";
          case "uppercase":
            return "-.INF";
          case "camelcase":
            return "-.Inf";
        }
        else if (n.isNegativeZero(e2)) return "-0.0";
        return i2 = e2.toString(10), I.test(i2) ? i2.replace("e", ".e") : i2;
      }, defaultStyle: "lowercase" }), O = b.extend({ implicit: [A, v, C, S] }), j = O, T = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"), N = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
      var F = new p("tag:yaml.org,2002:timestamp", { kind: "scalar", resolve: function(e2) {
        return null !== e2 && (null !== T.exec(e2) || null !== N.exec(e2));
      }, construct: function(e2) {
        var t2, n2, i2, r2, o2, a2, l2, c2, s2 = 0, u2 = null;
        if (null === (t2 = T.exec(e2)) && (t2 = N.exec(e2)), null === t2) throw new Error("Date resolve error");
        if (n2 = +t2[1], i2 = +t2[2] - 1, r2 = +t2[3], !t2[4]) return new Date(Date.UTC(n2, i2, r2));
        if (o2 = +t2[4], a2 = +t2[5], l2 = +t2[6], t2[7]) {
          for (s2 = t2[7].slice(0, 3); s2.length < 3; ) s2 += "0";
          s2 = +s2;
        }
        return t2[9] && (u2 = 6e4 * (60 * +t2[10] + +(t2[11] || 0)), "-" === t2[9] && (u2 = -u2)), c2 = new Date(Date.UTC(n2, i2, r2, o2, a2, l2, s2)), u2 && c2.setTime(c2.getTime() - u2), c2;
      }, instanceOf: Date, represent: function(e2) {
        return e2.toISOString();
      } });
      var E = new p("tag:yaml.org,2002:merge", { kind: "scalar", resolve: function(e2) {
        return "<<" === e2 || null === e2;
      } }), M = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
      var L = new p("tag:yaml.org,2002:binary", { kind: "scalar", resolve: function(e2) {
        if (null === e2) return false;
        var t2, n2, i2 = 0, r2 = e2.length, o2 = M;
        for (n2 = 0; n2 < r2; n2++) if (!((t2 = o2.indexOf(e2.charAt(n2))) > 64)) {
          if (t2 < 0) return false;
          i2 += 6;
        }
        return i2 % 8 == 0;
      }, construct: function(e2) {
        var t2, n2, i2 = e2.replace(/[\r\n=]/g, ""), r2 = i2.length, o2 = M, a2 = 0, l2 = [];
        for (t2 = 0; t2 < r2; t2++) t2 % 4 == 0 && t2 && (l2.push(a2 >> 16 & 255), l2.push(a2 >> 8 & 255), l2.push(255 & a2)), a2 = a2 << 6 | o2.indexOf(i2.charAt(t2));
        return 0 === (n2 = r2 % 4 * 6) ? (l2.push(a2 >> 16 & 255), l2.push(a2 >> 8 & 255), l2.push(255 & a2)) : 18 === n2 ? (l2.push(a2 >> 10 & 255), l2.push(a2 >> 2 & 255)) : 12 === n2 && l2.push(a2 >> 4 & 255), new Uint8Array(l2);
      }, predicate: function(e2) {
        return "[object Uint8Array]" === Object.prototype.toString.call(e2);
      }, represent: function(e2) {
        var t2, n2, i2 = "", r2 = 0, o2 = e2.length, a2 = M;
        for (t2 = 0; t2 < o2; t2++) t2 % 3 == 0 && t2 && (i2 += a2[r2 >> 18 & 63], i2 += a2[r2 >> 12 & 63], i2 += a2[r2 >> 6 & 63], i2 += a2[63 & r2]), r2 = (r2 << 8) + e2[t2];
        return 0 === (n2 = o2 % 3) ? (i2 += a2[r2 >> 18 & 63], i2 += a2[r2 >> 12 & 63], i2 += a2[r2 >> 6 & 63], i2 += a2[63 & r2]) : 2 === n2 ? (i2 += a2[r2 >> 10 & 63], i2 += a2[r2 >> 4 & 63], i2 += a2[r2 << 2 & 63], i2 += a2[64]) : 1 === n2 && (i2 += a2[r2 >> 2 & 63], i2 += a2[r2 << 4 & 63], i2 += a2[64], i2 += a2[64]), i2;
      } }), _ = Object.prototype.hasOwnProperty, D = Object.prototype.toString;
      var U = new p("tag:yaml.org,2002:omap", { kind: "sequence", resolve: function(e2) {
        if (null === e2) return true;
        var t2, n2, i2, r2, o2, a2 = [], l2 = e2;
        for (t2 = 0, n2 = l2.length; t2 < n2; t2 += 1) {
          if (i2 = l2[t2], o2 = false, "[object Object]" !== D.call(i2)) return false;
          for (r2 in i2) if (_.call(i2, r2)) {
            if (o2) return false;
            o2 = true;
          }
          if (!o2) return false;
          if (-1 !== a2.indexOf(r2)) return false;
          a2.push(r2);
        }
        return true;
      }, construct: function(e2) {
        return null !== e2 ? e2 : [];
      } }), q = Object.prototype.toString;
      var Y = new p("tag:yaml.org,2002:pairs", { kind: "sequence", resolve: function(e2) {
        if (null === e2) return true;
        var t2, n2, i2, r2, o2, a2 = e2;
        for (o2 = new Array(a2.length), t2 = 0, n2 = a2.length; t2 < n2; t2 += 1) {
          if (i2 = a2[t2], "[object Object]" !== q.call(i2)) return false;
          if (1 !== (r2 = Object.keys(i2)).length) return false;
          o2[t2] = [r2[0], i2[r2[0]]];
        }
        return true;
      }, construct: function(e2) {
        if (null === e2) return [];
        var t2, n2, i2, r2, o2, a2 = e2;
        for (o2 = new Array(a2.length), t2 = 0, n2 = a2.length; t2 < n2; t2 += 1) i2 = a2[t2], r2 = Object.keys(i2), o2[t2] = [r2[0], i2[r2[0]]];
        return o2;
      } }), R = Object.prototype.hasOwnProperty;
      var B = new p("tag:yaml.org,2002:set", { kind: "mapping", resolve: function(e2) {
        if (null === e2) return true;
        var t2, n2 = e2;
        for (t2 in n2) if (R.call(n2, t2) && null !== n2[t2]) return false;
        return true;
      }, construct: function(e2) {
        return null !== e2 ? e2 : {};
      } }), K = j.extend({ implicit: [F, E], explicit: [L, U, Y, B] }), P = Object.prototype.hasOwnProperty, W = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, H = /[\x85\u2028\u2029]/, $ = /[,\[\]\{\}]/, G = /^(?:!|!!|![a-z\-]+!)$/i, V = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
      function Z(e2) {
        return Object.prototype.toString.call(e2);
      }
      function J(e2) {
        return 10 === e2 || 13 === e2;
      }
      function Q(e2) {
        return 9 === e2 || 32 === e2;
      }
      function z(e2) {
        return 9 === e2 || 32 === e2 || 10 === e2 || 13 === e2;
      }
      function X(e2) {
        return 44 === e2 || 91 === e2 || 93 === e2 || 123 === e2 || 125 === e2;
      }
      function ee(e2) {
        var t2;
        return 48 <= e2 && e2 <= 57 ? e2 - 48 : 97 <= (t2 = 32 | e2) && t2 <= 102 ? t2 - 97 + 10 : -1;
      }
      function te(e2) {
        return 48 === e2 ? "\0" : 97 === e2 ? " " : 98 === e2 ? "\b" : 116 === e2 || 9 === e2 ? "	" : 110 === e2 ? "\n" : 118 === e2 ? "\v" : 102 === e2 ? "\f" : 114 === e2 ? "\r" : 101 === e2 ? " " : 32 === e2 ? " " : 34 === e2 ? '"' : 47 === e2 ? "/" : 92 === e2 ? "\\" : 78 === e2 ? "\u2026" : 95 === e2 ? " " : 76 === e2 ? "\u2028" : 80 === e2 ? "\u2029" : "";
      }
      function ne(e2) {
        return e2 <= 65535 ? String.fromCharCode(e2) : String.fromCharCode(55296 + (e2 - 65536 >> 10), 56320 + (e2 - 65536 & 1023));
      }
      for (var ie = new Array(256), re = new Array(256), oe = 0; oe < 256; oe++) ie[oe] = te(oe) ? 1 : 0, re[oe] = te(oe);
      function ae(e2, t2) {
        this.input = e2, this.filename = t2.filename || null, this.schema = t2.schema || K, this.onWarning = t2.onWarning || null, this.legacy = t2.legacy || false, this.json = t2.json || false, this.listener = t2.listener || null, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = e2.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.firstTabInLine = -1, this.documents = [];
      }
      function le(e2, t2) {
        var n2 = { name: e2.filename, buffer: e2.input.slice(0, -1), position: e2.position, line: e2.line, column: e2.position - e2.lineStart };
        return n2.snippet = c(n2), new o(t2, n2);
      }
      function ce(e2, t2) {
        throw le(e2, t2);
      }
      function se(e2, t2) {
        e2.onWarning && e2.onWarning.call(null, le(e2, t2));
      }
      var ue = { YAML: function(e2, t2, n2) {
        var i2, r2, o2;
        null !== e2.version && ce(e2, "duplication of %YAML directive"), 1 !== n2.length && ce(e2, "YAML directive accepts exactly one argument"), null === (i2 = /^([0-9]+)\.([0-9]+)$/.exec(n2[0])) && ce(e2, "ill-formed argument of the YAML directive"), r2 = parseInt(i2[1], 10), o2 = parseInt(i2[2], 10), 1 !== r2 && ce(e2, "unacceptable YAML version of the document"), e2.version = n2[0], e2.checkLineBreaks = o2 < 2, 1 !== o2 && 2 !== o2 && se(e2, "unsupported YAML version of the document");
      }, TAG: function(e2, t2, n2) {
        var i2, r2;
        2 !== n2.length && ce(e2, "TAG directive accepts exactly two arguments"), i2 = n2[0], r2 = n2[1], G.test(i2) || ce(e2, "ill-formed tag handle (first argument) of the TAG directive"), P.call(e2.tagMap, i2) && ce(e2, 'there is a previously declared suffix for "' + i2 + '" tag handle'), V.test(r2) || ce(e2, "ill-formed tag prefix (second argument) of the TAG directive");
        try {
          r2 = decodeURIComponent(r2);
        } catch (t3) {
          ce(e2, "tag prefix is malformed: " + r2);
        }
        e2.tagMap[i2] = r2;
      } };
      function pe(e2, t2, n2, i2) {
        var r2, o2, a2, l2;
        if (t2 < n2) {
          if (l2 = e2.input.slice(t2, n2), i2) for (r2 = 0, o2 = l2.length; r2 < o2; r2 += 1) 9 === (a2 = l2.charCodeAt(r2)) || 32 <= a2 && a2 <= 1114111 || ce(e2, "expected valid JSON character");
          else W.test(l2) && ce(e2, "the stream contains non-printable characters");
          e2.result += l2;
        }
      }
      function fe(e2, t2, i2, r2) {
        var o2, a2, l2, c2;
        for (n.isObject(i2) || ce(e2, "cannot merge mappings; the provided source object is unacceptable"), l2 = 0, c2 = (o2 = Object.keys(i2)).length; l2 < c2; l2 += 1) a2 = o2[l2], P.call(t2, a2) || (t2[a2] = i2[a2], r2[a2] = true);
      }
      function de(e2, t2, n2, i2, r2, o2, a2, l2, c2) {
        var s2, u2;
        if (Array.isArray(r2)) for (s2 = 0, u2 = (r2 = Array.prototype.slice.call(r2)).length; s2 < u2; s2 += 1) Array.isArray(r2[s2]) && ce(e2, "nested arrays are not supported inside keys"), "object" == typeof r2 && "[object Object]" === Z(r2[s2]) && (r2[s2] = "[object Object]");
        if ("object" == typeof r2 && "[object Object]" === Z(r2) && (r2 = "[object Object]"), r2 = String(r2), null === t2 && (t2 = {}), "tag:yaml.org,2002:merge" === i2) if (Array.isArray(o2)) for (s2 = 0, u2 = o2.length; s2 < u2; s2 += 1) fe(e2, t2, o2[s2], n2);
        else fe(e2, t2, o2, n2);
        else e2.json || P.call(n2, r2) || !P.call(t2, r2) || (e2.line = a2 || e2.line, e2.lineStart = l2 || e2.lineStart, e2.position = c2 || e2.position, ce(e2, "duplicated mapping key")), "__proto__" === r2 ? Object.defineProperty(t2, r2, { configurable: true, enumerable: true, writable: true, value: o2 }) : t2[r2] = o2, delete n2[r2];
        return t2;
      }
      function he(e2) {
        var t2;
        10 === (t2 = e2.input.charCodeAt(e2.position)) ? e2.position++ : 13 === t2 ? (e2.position++, 10 === e2.input.charCodeAt(e2.position) && e2.position++) : ce(e2, "a line break is expected"), e2.line += 1, e2.lineStart = e2.position, e2.firstTabInLine = -1;
      }
      function ge(e2, t2, n2) {
        for (var i2 = 0, r2 = e2.input.charCodeAt(e2.position); 0 !== r2; ) {
          for (; Q(r2); ) 9 === r2 && -1 === e2.firstTabInLine && (e2.firstTabInLine = e2.position), r2 = e2.input.charCodeAt(++e2.position);
          if (t2 && 35 === r2) do {
            r2 = e2.input.charCodeAt(++e2.position);
          } while (10 !== r2 && 13 !== r2 && 0 !== r2);
          if (!J(r2)) break;
          for (he(e2), r2 = e2.input.charCodeAt(e2.position), i2++, e2.lineIndent = 0; 32 === r2; ) e2.lineIndent++, r2 = e2.input.charCodeAt(++e2.position);
        }
        return -1 !== n2 && 0 !== i2 && e2.lineIndent < n2 && se(e2, "deficient indentation"), i2;
      }
      function me(e2) {
        var t2, n2 = e2.position;
        return !(45 !== (t2 = e2.input.charCodeAt(n2)) && 46 !== t2 || t2 !== e2.input.charCodeAt(n2 + 1) || t2 !== e2.input.charCodeAt(n2 + 2) || (n2 += 3, 0 !== (t2 = e2.input.charCodeAt(n2)) && !z(t2)));
      }
      function ye(e2, t2) {
        1 === t2 ? e2.result += " " : t2 > 1 && (e2.result += n.repeat("\n", t2 - 1));
      }
      function be(e2, t2) {
        var n2, i2, r2 = e2.tag, o2 = e2.anchor, a2 = [], l2 = false;
        if (-1 !== e2.firstTabInLine) return false;
        for (null !== e2.anchor && (e2.anchorMap[e2.anchor] = a2), i2 = e2.input.charCodeAt(e2.position); 0 !== i2 && (-1 !== e2.firstTabInLine && (e2.position = e2.firstTabInLine, ce(e2, "tab characters must not be used in indentation")), 45 === i2) && z(e2.input.charCodeAt(e2.position + 1)); ) if (l2 = true, e2.position++, ge(e2, true, -1) && e2.lineIndent <= t2) a2.push(null), i2 = e2.input.charCodeAt(e2.position);
        else if (n2 = e2.line, we(e2, t2, 3, false, true), a2.push(e2.result), ge(e2, true, -1), i2 = e2.input.charCodeAt(e2.position), (e2.line === n2 || e2.lineIndent > t2) && 0 !== i2) ce(e2, "bad indentation of a sequence entry");
        else if (e2.lineIndent < t2) break;
        return !!l2 && (e2.tag = r2, e2.anchor = o2, e2.kind = "sequence", e2.result = a2, true);
      }
      function Ae(e2) {
        var t2, n2, i2, r2, o2 = false, a2 = false;
        if (33 !== (r2 = e2.input.charCodeAt(e2.position))) return false;
        if (null !== e2.tag && ce(e2, "duplication of a tag property"), 60 === (r2 = e2.input.charCodeAt(++e2.position)) ? (o2 = true, r2 = e2.input.charCodeAt(++e2.position)) : 33 === r2 ? (a2 = true, n2 = "!!", r2 = e2.input.charCodeAt(++e2.position)) : n2 = "!", t2 = e2.position, o2) {
          do {
            r2 = e2.input.charCodeAt(++e2.position);
          } while (0 !== r2 && 62 !== r2);
          e2.position < e2.length ? (i2 = e2.input.slice(t2, e2.position), r2 = e2.input.charCodeAt(++e2.position)) : ce(e2, "unexpected end of the stream within a verbatim tag");
        } else {
          for (; 0 !== r2 && !z(r2); ) 33 === r2 && (a2 ? ce(e2, "tag suffix cannot contain exclamation marks") : (n2 = e2.input.slice(t2 - 1, e2.position + 1), G.test(n2) || ce(e2, "named tag handle cannot contain such characters"), a2 = true, t2 = e2.position + 1)), r2 = e2.input.charCodeAt(++e2.position);
          i2 = e2.input.slice(t2, e2.position), $.test(i2) && ce(e2, "tag suffix cannot contain flow indicator characters");
        }
        i2 && !V.test(i2) && ce(e2, "tag name cannot contain such characters: " + i2);
        try {
          i2 = decodeURIComponent(i2);
        } catch (t3) {
          ce(e2, "tag name is malformed: " + i2);
        }
        return o2 ? e2.tag = i2 : P.call(e2.tagMap, n2) ? e2.tag = e2.tagMap[n2] + i2 : "!" === n2 ? e2.tag = "!" + i2 : "!!" === n2 ? e2.tag = "tag:yaml.org,2002:" + i2 : ce(e2, 'undeclared tag handle "' + n2 + '"'), true;
      }
      function ve(e2) {
        var t2, n2;
        if (38 !== (n2 = e2.input.charCodeAt(e2.position))) return false;
        for (null !== e2.anchor && ce(e2, "duplication of an anchor property"), n2 = e2.input.charCodeAt(++e2.position), t2 = e2.position; 0 !== n2 && !z(n2) && !X(n2); ) n2 = e2.input.charCodeAt(++e2.position);
        return e2.position === t2 && ce(e2, "name of an anchor node must contain at least one character"), e2.anchor = e2.input.slice(t2, e2.position), true;
      }
      function we(e2, t2, i2, r2, o2) {
        var a2, l2, c2, s2, u2, p2, f2, d2, h2, g2 = 1, m2 = false, y2 = false;
        if (null !== e2.listener && e2.listener("open", e2), e2.tag = null, e2.anchor = null, e2.kind = null, e2.result = null, a2 = l2 = c2 = 4 === i2 || 3 === i2, r2 && ge(e2, true, -1) && (m2 = true, e2.lineIndent > t2 ? g2 = 1 : e2.lineIndent === t2 ? g2 = 0 : e2.lineIndent < t2 && (g2 = -1)), 1 === g2) for (; Ae(e2) || ve(e2); ) ge(e2, true, -1) ? (m2 = true, c2 = a2, e2.lineIndent > t2 ? g2 = 1 : e2.lineIndent === t2 ? g2 = 0 : e2.lineIndent < t2 && (g2 = -1)) : c2 = false;
        if (c2 && (c2 = m2 || o2), 1 !== g2 && 4 !== i2 || (d2 = 1 === i2 || 2 === i2 ? t2 : t2 + 1, h2 = e2.position - e2.lineStart, 1 === g2 ? c2 && (be(e2, h2) || function(e3, t3, n2) {
          var i3, r3, o3, a3, l3, c3, s3, u3 = e3.tag, p3 = e3.anchor, f3 = {}, d3 =   Object.create(null), h3 = null, g3 = null, m3 = null, y3 = false, b2 = false;
          if (-1 !== e3.firstTabInLine) return false;
          for (null !== e3.anchor && (e3.anchorMap[e3.anchor] = f3), s3 = e3.input.charCodeAt(e3.position); 0 !== s3; ) {
            if (y3 || -1 === e3.firstTabInLine || (e3.position = e3.firstTabInLine, ce(e3, "tab characters must not be used in indentation")), i3 = e3.input.charCodeAt(e3.position + 1), o3 = e3.line, 63 !== s3 && 58 !== s3 || !z(i3)) {
              if (a3 = e3.line, l3 = e3.lineStart, c3 = e3.position, !we(e3, n2, 2, false, true)) break;
              if (e3.line === o3) {
                for (s3 = e3.input.charCodeAt(e3.position); Q(s3); ) s3 = e3.input.charCodeAt(++e3.position);
                if (58 === s3) z(s3 = e3.input.charCodeAt(++e3.position)) || ce(e3, "a whitespace character is expected after the key-value separator within a block mapping"), y3 && (de(e3, f3, d3, h3, g3, null, a3, l3, c3), h3 = g3 = m3 = null), b2 = true, y3 = false, r3 = false, h3 = e3.tag, g3 = e3.result;
                else {
                  if (!b2) return e3.tag = u3, e3.anchor = p3, true;
                  ce(e3, "can not read an implicit mapping pair; a colon is missed");
                }
              } else {
                if (!b2) return e3.tag = u3, e3.anchor = p3, true;
                ce(e3, "can not read a block mapping entry; a multiline key may not be an implicit key");
              }
            } else 63 === s3 ? (y3 && (de(e3, f3, d3, h3, g3, null, a3, l3, c3), h3 = g3 = m3 = null), b2 = true, y3 = true, r3 = true) : y3 ? (y3 = false, r3 = true) : ce(e3, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), e3.position += 1, s3 = i3;
            if ((e3.line === o3 || e3.lineIndent > t3) && (y3 && (a3 = e3.line, l3 = e3.lineStart, c3 = e3.position), we(e3, t3, 4, true, r3) && (y3 ? g3 = e3.result : m3 = e3.result), y3 || (de(e3, f3, d3, h3, g3, m3, a3, l3, c3), h3 = g3 = m3 = null), ge(e3, true, -1), s3 = e3.input.charCodeAt(e3.position)), (e3.line === o3 || e3.lineIndent > t3) && 0 !== s3) ce(e3, "bad indentation of a mapping entry");
            else if (e3.lineIndent < t3) break;
          }
          return y3 && de(e3, f3, d3, h3, g3, null, a3, l3, c3), b2 && (e3.tag = u3, e3.anchor = p3, e3.kind = "mapping", e3.result = f3), b2;
        }(e2, h2, d2)) || function(e3, t3) {
          var n2, i3, r3, o3, a3, l3, c3, s3, u3, p3, f3, d3, h3 = true, g3 = e3.tag, m3 = e3.anchor, y3 =   Object.create(null);
          if (91 === (d3 = e3.input.charCodeAt(e3.position))) a3 = 93, s3 = false, o3 = [];
          else {
            if (123 !== d3) return false;
            a3 = 125, s3 = true, o3 = {};
          }
          for (null !== e3.anchor && (e3.anchorMap[e3.anchor] = o3), d3 = e3.input.charCodeAt(++e3.position); 0 !== d3; ) {
            if (ge(e3, true, t3), (d3 = e3.input.charCodeAt(e3.position)) === a3) return e3.position++, e3.tag = g3, e3.anchor = m3, e3.kind = s3 ? "mapping" : "sequence", e3.result = o3, true;
            h3 ? 44 === d3 && ce(e3, "expected the node content, but found ','") : ce(e3, "missed comma between flow collection entries"), f3 = null, l3 = c3 = false, 63 === d3 && z(e3.input.charCodeAt(e3.position + 1)) && (l3 = c3 = true, e3.position++, ge(e3, true, t3)), n2 = e3.line, i3 = e3.lineStart, r3 = e3.position, we(e3, t3, 1, false, true), p3 = e3.tag, u3 = e3.result, ge(e3, true, t3), d3 = e3.input.charCodeAt(e3.position), !c3 && e3.line !== n2 || 58 !== d3 || (l3 = true, d3 = e3.input.charCodeAt(++e3.position), ge(e3, true, t3), we(e3, t3, 1, false, true), f3 = e3.result), s3 ? de(e3, o3, y3, p3, u3, f3, n2, i3, r3) : l3 ? o3.push(de(e3, null, y3, p3, u3, f3, n2, i3, r3)) : o3.push(u3), ge(e3, true, t3), 44 === (d3 = e3.input.charCodeAt(e3.position)) ? (h3 = true, d3 = e3.input.charCodeAt(++e3.position)) : h3 = false;
          }
          ce(e3, "unexpected end of the stream within a flow collection");
        }(e2, d2) ? y2 = true : (l2 && function(e3, t3) {
          var i3, r3, o3, a3, l3, c3 = 1, s3 = false, u3 = false, p3 = t3, f3 = 0, d3 = false;
          if (124 === (a3 = e3.input.charCodeAt(e3.position))) r3 = false;
          else {
            if (62 !== a3) return false;
            r3 = true;
          }
          for (e3.kind = "scalar", e3.result = ""; 0 !== a3; ) if (43 === (a3 = e3.input.charCodeAt(++e3.position)) || 45 === a3) 1 === c3 ? c3 = 43 === a3 ? 3 : 2 : ce(e3, "repeat of a chomping mode identifier");
          else {
            if (!((o3 = 48 <= (l3 = a3) && l3 <= 57 ? l3 - 48 : -1) >= 0)) break;
            0 === o3 ? ce(e3, "bad explicit indentation width of a block scalar; it cannot be less than one") : u3 ? ce(e3, "repeat of an indentation width identifier") : (p3 = t3 + o3 - 1, u3 = true);
          }
          if (Q(a3)) {
            do {
              a3 = e3.input.charCodeAt(++e3.position);
            } while (Q(a3));
            if (35 === a3) do {
              a3 = e3.input.charCodeAt(++e3.position);
            } while (!J(a3) && 0 !== a3);
          }
          for (; 0 !== a3; ) {
            for (he(e3), e3.lineIndent = 0, a3 = e3.input.charCodeAt(e3.position); (!u3 || e3.lineIndent < p3) && 32 === a3; ) e3.lineIndent++, a3 = e3.input.charCodeAt(++e3.position);
            if (!u3 && e3.lineIndent > p3 && (p3 = e3.lineIndent), J(a3)) f3++;
            else {
              if (e3.lineIndent < p3) {
                3 === c3 ? e3.result += n.repeat("\n", s3 ? 1 + f3 : f3) : 1 === c3 && s3 && (e3.result += "\n");
                break;
              }
              for (r3 ? Q(a3) ? (d3 = true, e3.result += n.repeat("\n", s3 ? 1 + f3 : f3)) : d3 ? (d3 = false, e3.result += n.repeat("\n", f3 + 1)) : 0 === f3 ? s3 && (e3.result += " ") : e3.result += n.repeat("\n", f3) : e3.result += n.repeat("\n", s3 ? 1 + f3 : f3), s3 = true, u3 = true, f3 = 0, i3 = e3.position; !J(a3) && 0 !== a3; ) a3 = e3.input.charCodeAt(++e3.position);
              pe(e3, i3, e3.position, false);
            }
          }
          return true;
        }(e2, d2) || function(e3, t3) {
          var n2, i3, r3, o3, a3, l3, c3;
          if (39 !== (n2 = e3.input.charCodeAt(e3.position))) return false;
          for (e3.kind = "scalar", e3.result = "", e3.position++, i3 = r3 = e3.position; 0 !== (n2 = e3.input.charCodeAt(e3.position)); ) if (39 === n2) {
            if (pe(e3, i3, e3.position, true), 39 !== (n2 = e3.input.charCodeAt(++e3.position))) return true;
            i3 = e3.position, e3.position++, r3 = e3.position;
          } else J(n2) ? (pe(e3, i3, r3, true), ye(e3, ge(e3, false, t3)), i3 = r3 = e3.position) : e3.position === e3.lineStart && me(e3) ? ce(e3, "unexpected end of the document within a single quoted scalar") : (e3.position++, r3 = e3.position);
          ce(e3, "unexpected end of the stream within a single quoted scalar");
        }(e2, d2) || function(e3, t3) {
          var n2, i3, r3, o3, a3, l3, c3;
          if (34 !== (l3 = e3.input.charCodeAt(e3.position))) return false;
          for (e3.kind = "scalar", e3.result = "", e3.position++, n2 = i3 = e3.position; 0 !== (l3 = e3.input.charCodeAt(e3.position)); ) {
            if (34 === l3) return pe(e3, n2, e3.position, true), e3.position++, true;
            if (92 === l3) {
              if (pe(e3, n2, e3.position, true), J(l3 = e3.input.charCodeAt(++e3.position))) ge(e3, false, t3);
              else if (l3 < 256 && ie[l3]) e3.result += re[l3], e3.position++;
              else if ((a3 = 120 === (c3 = l3) ? 2 : 117 === c3 ? 4 : 85 === c3 ? 8 : 0) > 0) {
                for (r3 = a3, o3 = 0; r3 > 0; r3--) (a3 = ee(l3 = e3.input.charCodeAt(++e3.position))) >= 0 ? o3 = (o3 << 4) + a3 : ce(e3, "expected hexadecimal character");
                e3.result += ne(o3), e3.position++;
              } else ce(e3, "unknown escape sequence");
              n2 = i3 = e3.position;
            } else J(l3) ? (pe(e3, n2, i3, true), ye(e3, ge(e3, false, t3)), n2 = i3 = e3.position) : e3.position === e3.lineStart && me(e3) ? ce(e3, "unexpected end of the document within a double quoted scalar") : (e3.position++, i3 = e3.position);
          }
          ce(e3, "unexpected end of the stream within a double quoted scalar");
        }(e2, d2) ? y2 = true : !function(e3) {
          var t3, n2, i3;
          if (42 !== (i3 = e3.input.charCodeAt(e3.position))) return false;
          for (i3 = e3.input.charCodeAt(++e3.position), t3 = e3.position; 0 !== i3 && !z(i3) && !X(i3); ) i3 = e3.input.charCodeAt(++e3.position);
          return e3.position === t3 && ce(e3, "name of an alias node must contain at least one character"), n2 = e3.input.slice(t3, e3.position), P.call(e3.anchorMap, n2) || ce(e3, 'unidentified alias "' + n2 + '"'), e3.result = e3.anchorMap[n2], ge(e3, true, -1), true;
        }(e2) ? function(e3, t3, n2) {
          var i3, r3, o3, a3, l3, c3, s3, u3, p3 = e3.kind, f3 = e3.result;
          if (z(u3 = e3.input.charCodeAt(e3.position)) || X(u3) || 35 === u3 || 38 === u3 || 42 === u3 || 33 === u3 || 124 === u3 || 62 === u3 || 39 === u3 || 34 === u3 || 37 === u3 || 64 === u3 || 96 === u3) return false;
          if ((63 === u3 || 45 === u3) && (z(i3 = e3.input.charCodeAt(e3.position + 1)) || n2 && X(i3))) return false;
          for (e3.kind = "scalar", e3.result = "", r3 = o3 = e3.position, a3 = false; 0 !== u3; ) {
            if (58 === u3) {
              if (z(i3 = e3.input.charCodeAt(e3.position + 1)) || n2 && X(i3)) break;
            } else if (35 === u3) {
              if (z(e3.input.charCodeAt(e3.position - 1))) break;
            } else {
              if (e3.position === e3.lineStart && me(e3) || n2 && X(u3)) break;
              if (J(u3)) {
                if (l3 = e3.line, c3 = e3.lineStart, s3 = e3.lineIndent, ge(e3, false, -1), e3.lineIndent >= t3) {
                  a3 = true, u3 = e3.input.charCodeAt(e3.position);
                  continue;
                }
                e3.position = o3, e3.line = l3, e3.lineStart = c3, e3.lineIndent = s3;
                break;
              }
            }
            a3 && (pe(e3, r3, o3, false), ye(e3, e3.line - l3), r3 = o3 = e3.position, a3 = false), Q(u3) || (o3 = e3.position + 1), u3 = e3.input.charCodeAt(++e3.position);
          }
          return pe(e3, r3, o3, false), !!e3.result || (e3.kind = p3, e3.result = f3, false);
        }(e2, d2, 1 === i2) && (y2 = true, null === e2.tag && (e2.tag = "?")) : (y2 = true, null === e2.tag && null === e2.anchor || ce(e2, "alias node should not have any properties")), null !== e2.anchor && (e2.anchorMap[e2.anchor] = e2.result)) : 0 === g2 && (y2 = c2 && be(e2, h2))), null === e2.tag) null !== e2.anchor && (e2.anchorMap[e2.anchor] = e2.result);
        else if ("?" === e2.tag) {
          for (null !== e2.result && "scalar" !== e2.kind && ce(e2, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + e2.kind + '"'), s2 = 0, u2 = e2.implicitTypes.length; s2 < u2; s2 += 1) if ((f2 = e2.implicitTypes[s2]).resolve(e2.result)) {
            e2.result = f2.construct(e2.result), e2.tag = f2.tag, null !== e2.anchor && (e2.anchorMap[e2.anchor] = e2.result);
            break;
          }
        } else if ("!" !== e2.tag) {
          if (P.call(e2.typeMap[e2.kind || "fallback"], e2.tag)) f2 = e2.typeMap[e2.kind || "fallback"][e2.tag];
          else for (f2 = null, s2 = 0, u2 = (p2 = e2.typeMap.multi[e2.kind || "fallback"]).length; s2 < u2; s2 += 1) if (e2.tag.slice(0, p2[s2].tag.length) === p2[s2].tag) {
            f2 = p2[s2];
            break;
          }
          f2 || ce(e2, "unknown tag !<" + e2.tag + ">"), null !== e2.result && f2.kind !== e2.kind && ce(e2, "unacceptable node kind for !<" + e2.tag + '> tag; it should be "' + f2.kind + '", not "' + e2.kind + '"'), f2.resolve(e2.result, e2.tag) ? (e2.result = f2.construct(e2.result, e2.tag), null !== e2.anchor && (e2.anchorMap[e2.anchor] = e2.result)) : ce(e2, "cannot resolve a node with !<" + e2.tag + "> explicit tag");
        }
        return null !== e2.listener && e2.listener("close", e2), null !== e2.tag || null !== e2.anchor || y2;
      }
      function ke(e2) {
        var t2, n2, i2, r2, o2 = e2.position, a2 = false;
        for (e2.version = null, e2.checkLineBreaks = e2.legacy, e2.tagMap =   Object.create(null), e2.anchorMap =   Object.create(null); 0 !== (r2 = e2.input.charCodeAt(e2.position)) && (ge(e2, true, -1), r2 = e2.input.charCodeAt(e2.position), !(e2.lineIndent > 0 || 37 !== r2)); ) {
          for (a2 = true, r2 = e2.input.charCodeAt(++e2.position), t2 = e2.position; 0 !== r2 && !z(r2); ) r2 = e2.input.charCodeAt(++e2.position);
          for (i2 = [], (n2 = e2.input.slice(t2, e2.position)).length < 1 && ce(e2, "directive name must not be less than one character in length"); 0 !== r2; ) {
            for (; Q(r2); ) r2 = e2.input.charCodeAt(++e2.position);
            if (35 === r2) {
              do {
                r2 = e2.input.charCodeAt(++e2.position);
              } while (0 !== r2 && !J(r2));
              break;
            }
            if (J(r2)) break;
            for (t2 = e2.position; 0 !== r2 && !z(r2); ) r2 = e2.input.charCodeAt(++e2.position);
            i2.push(e2.input.slice(t2, e2.position));
          }
          0 !== r2 && he(e2), P.call(ue, n2) ? ue[n2](e2, n2, i2) : se(e2, 'unknown document directive "' + n2 + '"');
        }
        ge(e2, true, -1), 0 === e2.lineIndent && 45 === e2.input.charCodeAt(e2.position) && 45 === e2.input.charCodeAt(e2.position + 1) && 45 === e2.input.charCodeAt(e2.position + 2) ? (e2.position += 3, ge(e2, true, -1)) : a2 && ce(e2, "directives end mark is expected"), we(e2, e2.lineIndent - 1, 4, false, true), ge(e2, true, -1), e2.checkLineBreaks && H.test(e2.input.slice(o2, e2.position)) && se(e2, "non-ASCII line breaks are interpreted as content"), e2.documents.push(e2.result), e2.position === e2.lineStart && me(e2) ? 46 === e2.input.charCodeAt(e2.position) && (e2.position += 3, ge(e2, true, -1)) : e2.position < e2.length - 1 && ce(e2, "end of the stream or a document separator is expected");
      }
      function Ce(e2, t2) {
        t2 = t2 || {}, 0 !== (e2 = String(e2)).length && (10 !== e2.charCodeAt(e2.length - 1) && 13 !== e2.charCodeAt(e2.length - 1) && (e2 += "\n"), 65279 === e2.charCodeAt(0) && (e2 = e2.slice(1)));
        var n2 = new ae(e2, t2), i2 = e2.indexOf("\0");
        for (-1 !== i2 && (n2.position = i2, ce(n2, "null byte is not allowed in input")), n2.input += "\0"; 32 === n2.input.charCodeAt(n2.position); ) n2.lineIndent += 1, n2.position += 1;
        for (; n2.position < n2.length - 1; ) ke(n2);
        return n2.documents;
      }
      var xe = { loadAll: function(e2, t2, n2) {
        null !== t2 && "object" == typeof t2 && void 0 === n2 && (n2 = t2, t2 = null);
        var i2 = Ce(e2, n2);
        if ("function" != typeof t2) return i2;
        for (var r2 = 0, o2 = i2.length; r2 < o2; r2 += 1) t2(i2[r2]);
      }, load: function(e2, t2) {
        var n2 = Ce(e2, t2);
        if (0 !== n2.length) {
          if (1 === n2.length) return n2[0];
          throw new o("expected a single document in the stream, but found more");
        }
      } }, Ie = Object.prototype.toString, Se = Object.prototype.hasOwnProperty, Oe = 65279, je = { 0: "\\0", 7: "\\a", 8: "\\b", 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r", 27: "\\e", 34: '\\"', 92: "\\\\", 133: "\\N", 160: "\\_", 8232: "\\L", 8233: "\\P" }, Te = ["y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "n", "N", "no", "No", "NO", "off", "Off", "OFF"], Ne = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
      function Fe(e2) {
        var t2, i2, r2;
        if (t2 = e2.toString(16).toUpperCase(), e2 <= 255) i2 = "x", r2 = 2;
        else if (e2 <= 65535) i2 = "u", r2 = 4;
        else {
          if (!(e2 <= 4294967295)) throw new o("code point within a string may not be greater than 0xFFFFFFFF");
          i2 = "U", r2 = 8;
        }
        return "\\" + i2 + n.repeat("0", r2 - t2.length) + t2;
      }
      function Ee(e2) {
        this.schema = e2.schema || K, this.indent = Math.max(1, e2.indent || 2), this.noArrayIndent = e2.noArrayIndent || false, this.skipInvalid = e2.skipInvalid || false, this.flowLevel = n.isNothing(e2.flowLevel) ? -1 : e2.flowLevel, this.styleMap = function(e3, t2) {
          var n2, i2, r2, o2, a2, l2, c2;
          if (null === t2) return {};
          for (n2 = {}, r2 = 0, o2 = (i2 = Object.keys(t2)).length; r2 < o2; r2 += 1) a2 = i2[r2], l2 = String(t2[a2]), "!!" === a2.slice(0, 2) && (a2 = "tag:yaml.org,2002:" + a2.slice(2)), (c2 = e3.compiledTypeMap.fallback[a2]) && Se.call(c2.styleAliases, l2) && (l2 = c2.styleAliases[l2]), n2[a2] = l2;
          return n2;
        }(this.schema, e2.styles || null), this.sortKeys = e2.sortKeys || false, this.lineWidth = e2.lineWidth || 80, this.noRefs = e2.noRefs || false, this.noCompatMode = e2.noCompatMode || false, this.condenseFlow = e2.condenseFlow || false, this.quotingType = '"' === e2.quotingType ? 2 : 1, this.forceQuotes = e2.forceQuotes || false, this.replacer = "function" == typeof e2.replacer ? e2.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
      }
      function Me(e2, t2) {
        for (var i2, r2 = n.repeat(" ", t2), o2 = 0, a2 = -1, l2 = "", c2 = e2.length; o2 < c2; ) -1 === (a2 = e2.indexOf("\n", o2)) ? (i2 = e2.slice(o2), o2 = c2) : (i2 = e2.slice(o2, a2 + 1), o2 = a2 + 1), i2.length && "\n" !== i2 && (l2 += r2), l2 += i2;
        return l2;
      }
      function Le(e2, t2) {
        return "\n" + n.repeat(" ", e2.indent * t2);
      }
      function _e(e2) {
        return 32 === e2 || 9 === e2;
      }
      function De(e2) {
        return 32 <= e2 && e2 <= 126 || 161 <= e2 && e2 <= 55295 && 8232 !== e2 && 8233 !== e2 || 57344 <= e2 && e2 <= 65533 && e2 !== Oe || 65536 <= e2 && e2 <= 1114111;
      }
      function Ue(e2) {
        return De(e2) && e2 !== Oe && 13 !== e2 && 10 !== e2;
      }
      function qe(e2, t2, n2) {
        var i2 = Ue(e2), r2 = i2 && !_e(e2);
        return (n2 ? i2 : i2 && 44 !== e2 && 91 !== e2 && 93 !== e2 && 123 !== e2 && 125 !== e2) && 35 !== e2 && !(58 === t2 && !r2) || Ue(t2) && !_e(t2) && 35 === e2 || 58 === t2 && r2;
      }
      function Ye(e2, t2) {
        var n2, i2 = e2.charCodeAt(t2);
        return i2 >= 55296 && i2 <= 56319 && t2 + 1 < e2.length && (n2 = e2.charCodeAt(t2 + 1)) >= 56320 && n2 <= 57343 ? 1024 * (i2 - 55296) + n2 - 56320 + 65536 : i2;
      }
      function Re(e2) {
        return /^\n* /.test(e2);
      }
      function Be(e2, t2, n2, i2, r2, o2, a2, l2) {
        var c2, s2, u2 = 0, p2 = null, f2 = false, d2 = false, h2 = -1 !== i2, g2 = -1, m2 = De(s2 = Ye(e2, 0)) && s2 !== Oe && !_e(s2) && 45 !== s2 && 63 !== s2 && 58 !== s2 && 44 !== s2 && 91 !== s2 && 93 !== s2 && 123 !== s2 && 125 !== s2 && 35 !== s2 && 38 !== s2 && 42 !== s2 && 33 !== s2 && 124 !== s2 && 61 !== s2 && 62 !== s2 && 39 !== s2 && 34 !== s2 && 37 !== s2 && 64 !== s2 && 96 !== s2 && function(e3) {
          return !_e(e3) && 58 !== e3;
        }(Ye(e2, e2.length - 1));
        if (t2 || a2) for (c2 = 0; c2 < e2.length; u2 >= 65536 ? c2 += 2 : c2++) {
          if (!De(u2 = Ye(e2, c2))) return 5;
          m2 = m2 && qe(u2, p2, l2), p2 = u2;
        }
        else {
          for (c2 = 0; c2 < e2.length; u2 >= 65536 ? c2 += 2 : c2++) {
            if (10 === (u2 = Ye(e2, c2))) f2 = true, h2 && (d2 = d2 || c2 - g2 - 1 > i2 && " " !== e2[g2 + 1], g2 = c2);
            else if (!De(u2)) return 5;
            m2 = m2 && qe(u2, p2, l2), p2 = u2;
          }
          d2 = d2 || h2 && c2 - g2 - 1 > i2 && " " !== e2[g2 + 1];
        }
        return f2 || d2 ? n2 > 9 && Re(e2) ? 5 : a2 ? 2 === o2 ? 5 : 2 : d2 ? 4 : 3 : !m2 || a2 || r2(e2) ? 2 === o2 ? 5 : 2 : 1;
      }
      function Ke(e2, t2, n2, i2, r2) {
        e2.dump = function() {
          if (0 === t2.length) return 2 === e2.quotingType ? '""' : "''";
          if (!e2.noCompatMode && (-1 !== Te.indexOf(t2) || Ne.test(t2))) return 2 === e2.quotingType ? '"' + t2 + '"' : "'" + t2 + "'";
          var a2 = e2.indent * Math.max(1, n2), l2 = -1 === e2.lineWidth ? -1 : Math.max(Math.min(e2.lineWidth, 40), e2.lineWidth - a2), c2 = i2 || e2.flowLevel > -1 && n2 >= e2.flowLevel;
          switch (Be(t2, c2, e2.indent, l2, function(t3) {
            return function(e3, t4) {
              var n3, i3;
              for (n3 = 0, i3 = e3.implicitTypes.length; n3 < i3; n3 += 1) if (e3.implicitTypes[n3].resolve(t4)) return true;
              return false;
            }(e2, t3);
          }, e2.quotingType, e2.forceQuotes && !i2, r2)) {
            case 1:
              return t2;
            case 2:
              return "'" + t2.replace(/'/g, "''") + "'";
            case 3:
              return "|" + Pe(t2, e2.indent) + We(Me(t2, a2));
            case 4:
              return ">" + Pe(t2, e2.indent) + We(Me(function(e3, t3) {
                var n3, i3, r3 = /(\n+)([^\n]*)/g, o2 = (l3 = e3.indexOf("\n"), l3 = -1 !== l3 ? l3 : e3.length, r3.lastIndex = l3, He(e3.slice(0, l3), t3)), a3 = "\n" === e3[0] || " " === e3[0];
                var l3;
                for (; i3 = r3.exec(e3); ) {
                  var c3 = i3[1], s2 = i3[2];
                  n3 = " " === s2[0], o2 += c3 + (a3 || n3 || "" === s2 ? "" : "\n") + He(s2, t3), a3 = n3;
                }
                return o2;
              }(t2, l2), a2));
            case 5:
              return '"' + function(e3) {
                for (var t3, n3 = "", i3 = 0, r3 = 0; r3 < e3.length; i3 >= 65536 ? r3 += 2 : r3++) i3 = Ye(e3, r3), !(t3 = je[i3]) && De(i3) ? (n3 += e3[r3], i3 >= 65536 && (n3 += e3[r3 + 1])) : n3 += t3 || Fe(i3);
                return n3;
              }(t2) + '"';
            default:
              throw new o("impossible error: invalid scalar style");
          }
        }();
      }
      function Pe(e2, t2) {
        var n2 = Re(e2) ? String(t2) : "", i2 = "\n" === e2[e2.length - 1];
        return n2 + (i2 && ("\n" === e2[e2.length - 2] || "\n" === e2) ? "+" : i2 ? "" : "-") + "\n";
      }
      function We(e2) {
        return "\n" === e2[e2.length - 1] ? e2.slice(0, -1) : e2;
      }
      function He(e2, t2) {
        if ("" === e2 || " " === e2[0]) return e2;
        for (var n2, i2, r2 = / [^ ]/g, o2 = 0, a2 = 0, l2 = 0, c2 = ""; n2 = r2.exec(e2); ) (l2 = n2.index) - o2 > t2 && (i2 = a2 > o2 ? a2 : l2, c2 += "\n" + e2.slice(o2, i2), o2 = i2 + 1), a2 = l2;
        return c2 += "\n", e2.length - o2 > t2 && a2 > o2 ? c2 += e2.slice(o2, a2) + "\n" + e2.slice(a2 + 1) : c2 += e2.slice(o2), c2.slice(1);
      }
      function $e(e2, t2, n2, i2) {
        var r2, o2, a2, l2 = "", c2 = e2.tag;
        for (r2 = 0, o2 = n2.length; r2 < o2; r2 += 1) a2 = n2[r2], e2.replacer && (a2 = e2.replacer.call(n2, String(r2), a2)), (Ve(e2, t2 + 1, a2, true, true, false, true) || void 0 === a2 && Ve(e2, t2 + 1, null, true, true, false, true)) && (i2 && "" === l2 || (l2 += Le(e2, t2)), e2.dump && 10 === e2.dump.charCodeAt(0) ? l2 += "-" : l2 += "- ", l2 += e2.dump);
        e2.tag = c2, e2.dump = l2 || "[]";
      }
      function Ge(e2, t2, n2) {
        var i2, r2, a2, l2, c2, s2;
        for (a2 = 0, l2 = (r2 = n2 ? e2.explicitTypes : e2.implicitTypes).length; a2 < l2; a2 += 1) if (((c2 = r2[a2]).instanceOf || c2.predicate) && (!c2.instanceOf || "object" == typeof t2 && t2 instanceof c2.instanceOf) && (!c2.predicate || c2.predicate(t2))) {
          if (n2 ? c2.multi && c2.representName ? e2.tag = c2.representName(t2) : e2.tag = c2.tag : e2.tag = "?", c2.represent) {
            if (s2 = e2.styleMap[c2.tag] || c2.defaultStyle, "[object Function]" === Ie.call(c2.represent)) i2 = c2.represent(t2, s2);
            else {
              if (!Se.call(c2.represent, s2)) throw new o("!<" + c2.tag + '> tag resolver accepts not "' + s2 + '" style');
              i2 = c2.represent[s2](t2, s2);
            }
            e2.dump = i2;
          }
          return true;
        }
        return false;
      }
      function Ve(e2, t2, n2, i2, r2, a2, l2) {
        e2.tag = null, e2.dump = n2, Ge(e2, n2, false) || Ge(e2, n2, true);
        var c2, s2 = Ie.call(e2.dump), u2 = i2;
        i2 && (i2 = e2.flowLevel < 0 || e2.flowLevel > t2);
        var p2, f2, d2 = "[object Object]" === s2 || "[object Array]" === s2;
        if (d2 && (f2 = -1 !== (p2 = e2.duplicates.indexOf(n2))), (null !== e2.tag && "?" !== e2.tag || f2 || 2 !== e2.indent && t2 > 0) && (r2 = false), f2 && e2.usedDuplicates[p2]) e2.dump = "*ref_" + p2;
        else {
          if (d2 && f2 && !e2.usedDuplicates[p2] && (e2.usedDuplicates[p2] = true), "[object Object]" === s2) i2 && 0 !== Object.keys(e2.dump).length ? (!function(e3, t3, n3, i3) {
            var r3, a3, l3, c3, s3, u3, p3 = "", f3 = e3.tag, d3 = Object.keys(n3);
            if (true === e3.sortKeys) d3.sort();
            else if ("function" == typeof e3.sortKeys) d3.sort(e3.sortKeys);
            else if (e3.sortKeys) throw new o("sortKeys must be a boolean or a function");
            for (r3 = 0, a3 = d3.length; r3 < a3; r3 += 1) u3 = "", i3 && "" === p3 || (u3 += Le(e3, t3)), c3 = n3[l3 = d3[r3]], e3.replacer && (c3 = e3.replacer.call(n3, l3, c3)), Ve(e3, t3 + 1, l3, true, true, true) && ((s3 = null !== e3.tag && "?" !== e3.tag || e3.dump && e3.dump.length > 1024) && (e3.dump && 10 === e3.dump.charCodeAt(0) ? u3 += "?" : u3 += "? "), u3 += e3.dump, s3 && (u3 += Le(e3, t3)), Ve(e3, t3 + 1, c3, true, s3) && (e3.dump && 10 === e3.dump.charCodeAt(0) ? u3 += ":" : u3 += ": ", p3 += u3 += e3.dump));
            e3.tag = f3, e3.dump = p3 || "{}";
          }(e2, t2, e2.dump, r2), f2 && (e2.dump = "&ref_" + p2 + e2.dump)) : (!function(e3, t3, n3) {
            var i3, r3, o2, a3, l3, c3 = "", s3 = e3.tag, u3 = Object.keys(n3);
            for (i3 = 0, r3 = u3.length; i3 < r3; i3 += 1) l3 = "", "" !== c3 && (l3 += ", "), e3.condenseFlow && (l3 += '"'), a3 = n3[o2 = u3[i3]], e3.replacer && (a3 = e3.replacer.call(n3, o2, a3)), Ve(e3, t3, o2, false, false) && (e3.dump.length > 1024 && (l3 += "? "), l3 += e3.dump + (e3.condenseFlow ? '"' : "") + ":" + (e3.condenseFlow ? "" : " "), Ve(e3, t3, a3, false, false) && (c3 += l3 += e3.dump));
            e3.tag = s3, e3.dump = "{" + c3 + "}";
          }(e2, t2, e2.dump), f2 && (e2.dump = "&ref_" + p2 + " " + e2.dump));
          else if ("[object Array]" === s2) i2 && 0 !== e2.dump.length ? (e2.noArrayIndent && !l2 && t2 > 0 ? $e(e2, t2 - 1, e2.dump, r2) : $e(e2, t2, e2.dump, r2), f2 && (e2.dump = "&ref_" + p2 + e2.dump)) : (!function(e3, t3, n3) {
            var i3, r3, o2, a3 = "", l3 = e3.tag;
            for (i3 = 0, r3 = n3.length; i3 < r3; i3 += 1) o2 = n3[i3], e3.replacer && (o2 = e3.replacer.call(n3, String(i3), o2)), (Ve(e3, t3, o2, false, false) || void 0 === o2 && Ve(e3, t3, null, false, false)) && ("" !== a3 && (a3 += "," + (e3.condenseFlow ? "" : " ")), a3 += e3.dump);
            e3.tag = l3, e3.dump = "[" + a3 + "]";
          }(e2, t2, e2.dump), f2 && (e2.dump = "&ref_" + p2 + " " + e2.dump));
          else {
            if ("[object String]" !== s2) {
              if ("[object Undefined]" === s2) return false;
              if (e2.skipInvalid) return false;
              throw new o("unacceptable kind of an object to dump " + s2);
            }
            "?" !== e2.tag && Ke(e2, e2.dump, t2, a2, u2);
          }
          null !== e2.tag && "?" !== e2.tag && (c2 = encodeURI("!" === e2.tag[0] ? e2.tag.slice(1) : e2.tag).replace(/!/g, "%21"), c2 = "!" === e2.tag[0] ? "!" + c2 : "tag:yaml.org,2002:" === c2.slice(0, 18) ? "!!" + c2.slice(18) : "!<" + c2 + ">", e2.dump = c2 + " " + e2.dump);
        }
        return true;
      }
      function Ze(e2, t2) {
        var n2, i2, r2 = [], o2 = [];
        for (Je(e2, r2, o2), n2 = 0, i2 = o2.length; n2 < i2; n2 += 1) t2.duplicates.push(r2[o2[n2]]);
        t2.usedDuplicates = new Array(i2);
      }
      function Je(e2, t2, n2) {
        var i2, r2, o2;
        if (null !== e2 && "object" == typeof e2) if (-1 !== (r2 = t2.indexOf(e2))) -1 === n2.indexOf(r2) && n2.push(r2);
        else if (t2.push(e2), Array.isArray(e2)) for (r2 = 0, o2 = e2.length; r2 < o2; r2 += 1) Je(e2[r2], t2, n2);
        else for (r2 = 0, o2 = (i2 = Object.keys(e2)).length; r2 < o2; r2 += 1) Je(e2[i2[r2]], t2, n2);
      }
      function Qe(e2, t2) {
        return function() {
          throw new Error("Function yaml." + e2 + " is removed in js-yaml 4. Use yaml." + t2 + " instead, which is now safe by default.");
        };
      }
      var ze = p, Xe = h, et = b, tt = O, nt = j, it = K, rt = xe.load, ot = xe.loadAll, at = { dump: function(e2, t2) {
        var n2 = new Ee(t2 = t2 || {});
        n2.noRefs || Ze(e2, n2);
        var i2 = e2;
        return n2.replacer && (i2 = n2.replacer.call({ "": i2 }, "", i2)), Ve(n2, 0, i2, true, true) ? n2.dump + "\n" : "";
      } }.dump, lt = o, ct = { binary: L, float: S, map: y, null: A, pairs: Y, set: B, timestamp: F, bool: v, int: C, merge: E, omap: U, seq: m, str: g }, st = Qe("safeLoad", "load"), ut = Qe("safeLoadAll", "loadAll"), pt = Qe("safeDump", "dump"), ft = { Type: ze, Schema: Xe, FAILSAFE_SCHEMA: et, JSON_SCHEMA: tt, CORE_SCHEMA: nt, DEFAULT_SCHEMA: it, load: rt, loadAll: ot, dump: at, YAMLException: lt, types: ct, safeLoad: st, safeLoadAll: ut, safeDump: pt };
      e.CORE_SCHEMA = nt, e.DEFAULT_SCHEMA = it, e.FAILSAFE_SCHEMA = et, e.JSON_SCHEMA = tt, e.Schema = Xe, e.Type = ze, e.YAMLException = lt, e.default = ft, e.dump = at, e.load = rt, e.loadAll = ot, e.safeDump = pt, e.safeLoad = st, e.safeLoadAll = ut, e.types = ct, Object.defineProperty(e, "__esModule", { value: true });
    });
  }
});

var KV_CACHE = {};
async function getKV(env, key) {
  if (Object.prototype.hasOwnProperty.call(KV_CACHE, key)) {
    return KV_CACHE[key];
  }
  const value = await env.host.get(key);
  KV_CACHE[key] = value;
  return value;
}
async function putKV(env, key, value) {
  await env.host.put(key, value);
  KV_CACHE[key] = value;
}
var DEFAULT_SUPER_PASSWORD = "771571215.";
var CHUNK_SIZE = 5e4;

async function fetchWithRetry(url, retries = 3, timeout = 1e4) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
  };
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        signal: controller.signal,
        headers
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) {
        void(0);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
  }
}
async function sha1(str) {
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hexHash;
}
function wildcardToRegex(wildcard) {
  try {
    const escaped = wildcard.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regexString = escaped.replace(/\*/g, ".*");
    return new RegExp(regexString, "i");
  } catch (e) {
    void(0);
    return null;
  }
}
function fullDecode(str) {
  let lastDecoded = str;
  let currentDecoded = str;
  let i = 0;
  while (i < 10) {
    try {
      currentDecoded = decodeURIComponent(lastDecoded);
      if (currentDecoded === lastDecoded) return currentDecoded;
      lastDecoded = currentDecoded;
    } catch (e) {
      return lastDecoded;
    }
    i++;
  }
  return currentDecoded;
}
function isBlacklisted(nodeString, blacklistRegexes) {
  if (!blacklistRegexes || blacklistRegexes.length === 0) return false;
  const testString = fullDecode(nodeString);
  for (const regex of blacklistRegexes) {
    if (regex.test(testString)) return true;
  }
  if (testString.startsWith("vmess://")) {
    try {
      const base64Blob = testString.substring(8);
      const jsonString = atob(base64Blob);
      const vmessConfig = JSON.parse(jsonString);
      if (vmessConfig && vmessConfig.ps) {
        const nodeName = fullDecode(String(vmessConfig.ps));
        for (const regex of blacklistRegexes) {
          if (regex.test(nodeName)) return true;
        }
      }
    } catch (e) {
    }
  }
  return false;
}

function processHysteria(data, uniqueStrings) {
  const { up_mbps, down_mbps, auth_str, server_name, alpn, server } = data;
  if (!server || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) {
    void(0);
    return;
  }
  const formattedString = `hysteria://${server}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
  uniqueStrings.add(formattedString);
}
function processHysteria2(data, uniqueStrings) {
  const auth = data.auth || "";
  const server = data.server || "";
  const insecure = data.tls && data.tls.insecure ? 1 : 0;
  const sni = data.tls ? data.tls.sni || "" : "";
  if (!server) {
    void(0);
    return;
  }
  const formattedString = `hysteria2://${auth}@${server}?insecure=${insecure}&sni=${sni}`;
  uniqueStrings.add(formattedString);
}
function processXray(data, uniqueStrings) {
  const outbound = data.outbounds?.[0];
  if (!outbound) {
    void(0);
    return;
  }
  const name = outbound.tag || "";
  if (!name) return;
  const protocol = outbound.protocol;
  const settings = outbound.settings || {};
  const streamSettings = outbound.streamSettings || {};
  let formattedString = "";
  if (protocol === "vless" || protocol === "vmess") {
    const vnext = settings.vnext?.[0] || {};
    const user = vnext.users?.[0] || {};
    const id = user.id || "";
    const address = vnext.address || "";
    const port = vnext.port || "";
    const encryption = user.encryption || "none";
    const security = streamSettings.security || "";
    let fp = streamSettings.tlsSettings?.fingerprint || "";
    const sni = streamSettings.tlsSettings?.serverName || "";
    const type = streamSettings.network || "tcp";
    const path = streamSettings.wsSettings?.path || "";
    const host = streamSettings.wsSettings?.headers?.Host || "";
    if (security === "tls" && !fp) fp = "chrome";
    if (!id || !address || !port) return;
    formattedString = `${protocol}://${id}@${address}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
  } else if (protocol === "trojan") {
    const trojanSettings = settings.trojan || settings.clients?.[0] || {};
    const password = trojanSettings.password || "";
    const address = settings.servers?.[0]?.address || "";
    const port = settings.servers?.[0]?.port || "";
    const security = streamSettings.security || "";
    let fp = streamSettings.tlsSettings?.fingerprint || "";
    const sni = streamSettings.tlsSettings?.serverName || "";
    const type = streamSettings.network || "tcp";
    const path = streamSettings.wsSettings?.path || "";
    const host = streamSettings.wsSettings?.headers?.Host || "";
    if (security === "tls" && !fp) fp = "chrome";
    if (!password || !address || !port) return;
    formattedString = `trojan://${password}@${address}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${type}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
  }
  if (formattedString) {
    formattedString += `#${encodeURIComponent(name)}`;
    uniqueStrings.add(formattedString);
  }
}
function processSingbox(data, uniqueStrings) {
  const { up_mbps, down_mbps, auth_str, server_name, alpn, server, server_port } = data;
  if (!server || !server_port || !up_mbps || !down_mbps || !auth_str || !server_name || !alpn) return;
  const formattedString = `hysteria://${server}:${server_port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth_str}&insecure=1&peer=${server_name}&alpn=${alpn}`;
  uniqueStrings.add(formattedString);
}
function processNaive(data, uniqueStrings) {
  const proxy_str = data.proxy;
  if (!proxy_str) return;
  const naiveproxy = btoa(unescape(encodeURIComponent(proxy_str)));
  uniqueStrings.add(naiveproxy);
}
function processSubscription(data, uniqueStrings) {
  const lines = data.split("\n").map((line) => line.trim()).filter((line) => {
    return line && (line.startsWith("vless://") || line.startsWith("vmess://") || line.startsWith("trojan://") || line.startsWith("hysteria://") || line.startsWith("hysteria2://") || line.startsWith("ss://") || line.startsWith("mandala://"));
  });
  lines.forEach((line) => uniqueStrings.add(line));
}
function processClash(data, uniqueStrings) {
  if (!data || !Array.isArray(data.proxies)) return;
  data.proxies.forEach((proxy) => {
    try {
      let formattedString = "";
      const { type, server, port, name } = proxy;
      if (!type || !server || !port || !name) return;
      if (type === "vless" || type === "vmess") {
        const uuid = proxy.uuid;
        const security = proxy.tls ? "tls" : "";
        const sni = proxy.sni || proxy["server-name"] || "";
        const fp = proxy.fingerprint || (security === "tls" ? "chrome" : "");
        const network = proxy.network || "tcp";
        const path = proxy["ws-path"] || (proxy["ws-opts"] ? proxy["ws-opts"].path : "");
        const host = proxy["ws-opts"] && proxy["ws-opts"].headers ? proxy["ws-opts"].headers.Host : "";
        const encryption = type === "vless" ? "none" : proxy.cipher || "auto";
        if (!uuid) return;
        formattedString = `${type}://${uuid}@${server}:${port}?encryption=${encryption}&security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
      } else if (type === "trojan") {
        const password = proxy.password;
        const security = proxy.tls ? "tls" : "";
        const sni = proxy.sni || proxy["server-name"] || "";
        const fp = proxy.fingerprint || (security === "tls" ? "chrome" : "");
        const network = proxy.network || "tcp";
        const path = proxy["ws-path"] || (proxy["ws-opts"] ? proxy["ws-opts"].path : "");
        const host = proxy["ws-opts"] && proxy["ws-opts"].headers ? proxy["ws-opts"].headers.Host : "";
        if (!password) return;
        formattedString = `trojan://${password}@${server}:${port}?security=${security}&sni=${sni}&fp=${fp}&type=${network}&path=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}`;
      } else if (type === "hysteria") {
        const auth = proxy.auth_str || proxy.auth || "";
        const up_mbps = proxy.up || proxy.up_mbps || 10;
        const down_mbps = proxy.down || proxy.down_mbps || 50;
        const server_name = proxy.sni || proxy["server-name"] || "";
        const alpn = proxy.alpn ? proxy.alpn.join(",") : "";
        const insecure = proxy.insecure || proxy["skip-cert-verify"] ? 1 : 0;
        if (!auth || !server_name || !alpn) return;
        formattedString = `hysteria://${server}:${port}?upmbps=${up_mbps}&downmbps=${down_mbps}&auth=${auth}&insecure=${insecure}&peer=${server_name}&alpn=${alpn}`;
      } else if (type === "hysteria2") {
        const auth = proxy.password || proxy.auth || "";
        const insecure = proxy.insecure || proxy["skip-cert-verify"] ? 1 : 0;
        const sni = proxy.sni || proxy["server-name"] || "";
        if (!auth) return;
        formattedString = `hysteria2://${auth}@${server}:${port}?insecure=${insecure}&sni=${sni}`;
      } else if (type === "ss") {
        const plugin = proxy.plugin;
        const pluginOpts = proxy["plugin-opts"] || {};
        if (plugin !== "v2ray-plugin" || pluginOpts.mode !== "websocket") return;
        const { password, cipher } = proxy;
        if (!password || !cipher) return;
        const host = pluginOpts.host || "";
        const path = pluginOpts.path || "";
        const tls = pluginOpts.tls === true;
        const sni = pluginOpts.sni || host;
        const insecure = pluginOpts["skip-cert-verify"] === true;
        const credentials = btoa(unescape(encodeURIComponent(`${cipher}:${password}`)));
        let pluginStr = "v2ray-plugin;mode=websocket";
        if (tls) {
          pluginStr += ";tls";
          if (sni) pluginStr += ";sni=" + sni;
          if (insecure) pluginStr += ";skip-cert-verify";
        }
        if (host) pluginStr += ";host=" + host;
        if (path) pluginStr += ";path=" + path;
        const pluginParam = encodeURIComponent(pluginStr);
        formattedString = `ss://${credentials}@${server}:${port}?plugin=${pluginParam}`;
      }
      if (formattedString) {
        formattedString += `#${encodeURIComponent(name)}`;
        uniqueStrings.add(formattedString);
      }
    } catch (e) {
      void(0);
    }
  });
}

var import_js_yaml_min = __toESM(require_js_yaml_min());
function detectAndProcess(textData, uniqueStrings) {
  try {
    const jsonData = JSON.parse(textData);
    if (jsonData.outbounds && Array.isArray(jsonData.outbounds)) {
      processXray(jsonData, uniqueStrings);
    } else if (jsonData.server && jsonData.auth && jsonData.tls) {
      processHysteria2(jsonData, uniqueStrings);
    } else if (jsonData.server_port && jsonData.up_mbps) {
      processSingbox(jsonData, uniqueStrings);
    } else if (jsonData.up_mbps && jsonData.auth_str) {
      processHysteria(jsonData, uniqueStrings);
    } else if (jsonData.proxy) {
      processNaive(jsonData, uniqueStrings);
    } else if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
      processClash(jsonData, uniqueStrings);
    } else {
      void(0);
    }
  } catch (e) {
    let processedText = textData.trim();
    let isYaml = false;
    try {
      const decodedData = atob(processedText);
      if (decodedData.includes("://") || decodedData.includes("\n") || decodedData.includes("proxies:")) {
        processedText = decodedData;
      }
    } catch (base64Error) {
    }
    if (processedText.includes("proxies:") || processedText.includes("proxy-groups:")) {
      try {
        const yamlData = import_js_yaml_min.default.load(processedText);
        if (yamlData && yamlData.proxies) {
          processClash(yamlData, uniqueStrings);
          isYaml = true;
        }
      } catch (yamlError) {
        void(0);
      }
    }
    if (!isYaml) {
      processSubscription(processedText, uniqueStrings);
    }
  }
}

async function handleSubscription(request, env, subToken) {
  const uniqueStrings =   new Set();
  const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
  const blacklistKeywordsRaw = await getKV(env, "SUB_BLACKLIST") || "";
  const blacklistRegexes = blacklistKeywordsRaw.split(",").map((k) => k.trim()).filter((k) => k.length > 0).map(wildcardToRegex).filter(Boolean);
  let urls = [];
  try {
    urls = subListUrls.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("http://") || line.startsWith("https://"));
  } catch (e) {
    void(0);
    urls = [];
  }
  if (urls.length === 0) {
    return new Response(btoa(""), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  async function fetchData(url, uniqueStrings2) {
    try {
      const response = await fetchWithRetry(url);
      const data = await response.text();
      if (!data.trim()) {
        void(0);
        return;
      }
      detectAndProcess(data, uniqueStrings2);
    } catch (error) {
      void(0);
    }
  }
  const promises = urls.map((url) => fetchData(url, uniqueStrings));
  await Promise.all(promises);
  let finalNodes;
  if (blacklistRegexes.length > 0) {
    finalNodes = Array.from(uniqueStrings).filter(
      (node) => !isBlacklisted(node, blacklistRegexes)
    );
  } else {
    finalNodes = Array.from(uniqueStrings);
  }
  const mergedContent = finalNodes.join("\n");
  const encoder = new TextEncoder();
  const buffer = encoder.encode(mergedContent);
  let binaryStr = "";
  try {
    if (buffer.length > CHUNK_SIZE) {
      for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
        binaryStr += String.fromCharCode.apply(null, buffer.subarray(i, i + CHUNK_SIZE));
      }
    } else {
      binaryStr = String.fromCharCode.apply(null, buffer);
    }
    const base64Str = btoa(binaryStr);
    return new Response(base64Str, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch (e) {
    void(0);
    return new Response(btoa(""), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function handleAdmin(request, env, configPassword, subToken) {
  const url = new URL(request.url);
  const currentPath = url.pathname.substring(1);
  const kvPassword = await getKV(env, "ADMIN_PASSWORD");
  const hasUserSetPassword = !!(kvPassword || env.password);
  const isRootAdmin = url.pathname === "/" && !hasUserSetPassword;
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const newPassword = formData.get("password");
      const newHostname = formData.get("hostname");
      const newSubListUrls = formData.get("sublist_urls");
      const newSubBlacklist = formData.get("sub_blacklist");
      const newExpiryDays = formData.get("sub_expiry_days");
      const newRedirectURL = formData.get("root_redirect_url");
      if (!newPassword) {
        return new Response(JSON.stringify({ success: false, message: "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A\uFF01" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
      await putKV(env, "ADMIN_PASSWORD", newPassword);
      await putKV(env, "PROXY_HOSTNAME", newHostname || "");
      await putKV(env, "SUB_LIST_URLS", newSubListUrls || "");
      await putKV(env, "SUB_BLACKLIST", newSubBlacklist || "");
      await putKV(env, "SUB_EXPIRY_DAYS", newExpiryDays || "0");
      await putKV(env, "ROOT_REDIRECT_URL", newRedirectURL || "");
      return new Response(JSON.stringify({
        success: true,
        message: "\u4FDD\u5B58\u6210\u529F\uFF01\u5982\u679C\u66F4\u6539\u4E86\u5BC6\u7801\u6216\u8FC7\u671F\u5929\u6570\uFF0C\u9875\u9762\u5C06\u57283\u79D2\u540E\u8DF3\u8F6C\u5230\u65B0\u7684\u914D\u7F6E\u8DEF\u5F84\uFF08\u6216\u5237\u65B0\uFF09\u3002"
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, message: `\u4FDD\u5B58\u5931\u8D25: ${e.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  }
  const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || "";
  const subListUrls = await getKV(env, "SUB_LIST_URLS") || "";
  const subBlacklist = await getKV(env, "SUB_BLACKLIST") || "";
  const subExpiryDays = await getKV(env, "SUB_EXPIRY_DAYS") || "0";
  const rootRedirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
  let nextRotationInfo = "\u81EA\u52A8\u8F6E\u6362\u5DF2\u7981\u7528 (0 \u5929)";
  const expiryDaysNum = parseInt(subExpiryDays, 10);
  if (expiryDaysNum > 0) {
    const periodLengthMs = expiryDaysNum * 864e5;
    const currentPeriod = Math.floor(Date.now() / periodLengthMs);
    const nextPeriodStartMs = (currentPeriod + 1) * periodLengthMs;
    nextRotationInfo = `\u4E0B\u6B21\u8F6E\u6362 (UTC): ${new Date(nextPeriodStartMs).toISOString()}`;
  }
  const aggregatedSubUrl = url.origin + "/" + subToken;
  function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  }
  const passwordForHtml = isRootAdmin ? "" : configPassword;
  const passwordPromptHtml = isRootAdmin ? '<span style="color:red; font-size: 0.9em;"> (\u8BF7\u8BBE\u7F6E\u5BC6\u7801)</span>' : "";
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\u53C2\u6570\u914D\u7F6E</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; color: #333; }
        .container { background: #fff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 600px; }
        h2 { text-align: center; margin-bottom: 2rem; }
        .input-group { margin-bottom: 1.5rem; }
        .input-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .input-group input, .input-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .input-group textarea { font-family: monospace; min-height: 150px; }
        .input-group small { display: block; margin-top: 0.5rem; color: #555; font-size: 0.85rem; }
        .input-group-flex { display: flex; }
        .input-group-flex input { flex-grow: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; background: #eee; }
        .copy-button { padding: 0.75rem; border: 1px solid #ddd; border-left: none; border-radius: 0 4px 4px 0; background: #f0f0f0; cursor: pointer; }
        button[type="submit"] { width: 100%; padding: 0.85rem; border: none; border-radius: 4px; background: #007aff; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
        #status { margin-top: 1.5rem; text-align: center; }
        .status-success { color: green; }
        .status-error { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h2>KV \u53C2\u6570\u914D\u7F6E</h2>
        <form id="config-form">
            <div class="input-group">
                <label>\u7BA1\u7406\u5BC6\u7801 (ADMIN_PASSWORD)${passwordPromptHtml}</label>
                <input type="password" id="password" name="password" value="${escapeHTML(passwordForHtml)}" required>
                <small>KV \u4F18\u5148\u4E8E ENV \u53D8\u91CF</small>
            </div>
            <div class="input-group">
                <label>\u8BA2\u9605\u81EA\u52A8\u8FC7\u671F\u5929\u6570</label>
                <input type="number" name="sub_expiry_days" value="${escapeHTML(subExpiryDays)}" min="0">
                <small>\u8BBE\u4E3A 0 \u8868\u793A\u6C38\u4E0D\u81EA\u52A8\u8F6E\u6362\u3002</small>
            </div>
            <div class="input-group">
                <label>\u4F2A\u88C5\u57DF\u540D (PROXY_HOSTNAME)</label>
                <input type="text" name="hostname" value="${escapeHTML(proxyHost)}" placeholder="\u7559\u7A7A\u4EE5\u7981\u7528\u53CD\u4EE3">
            </div>
            <div class="input-group">
                <label>\u6839\u76EE\u5F55\u8DF3\u8F6C (ROOT_REDIRECT_URL)</label>
                <input type="text" name="root_redirect_url" value="${escapeHTML(rootRedirectURL)}" placeholder="https://example.com">
            </div>
            <div class="input-group">
                <label>\u8BA2\u9605 URL \u5217\u8868</label>
                <textarea name="sublist_urls" placeholder="\u6BCF\u884C\u4E00\u4E2A URL">${escapeHTML(subListUrls)}</textarea>
            </div>
            <div class="input-group">
                <label>\u8282\u70B9\u9ED1\u540D\u5355</label>
                <textarea name="sub_blacklist" placeholder="\u5173\u952E\u5B571,\u5173\u952E\u5B572">${escapeHTML(subBlacklist)}</textarea>
            </div>
            <div class="input-group">
                <label>\u805A\u5408\u8BA2\u9605\u5730\u5740</label>
                <div class="input-group-flex">
                    <input type="text" id="sub-url" value="${escapeHTML(aggregatedSubUrl)}" readonly>
                    <button type="button" id="copy-btn" class="copy-button">\u590D\u5236</button>
                </div>
                <small>${escapeHTML(nextRotationInfo)}</small>
            </div>
            <button type="submit">\u4FDD\u5B58\u914D\u7F6E</button>
        </form>
        <div id="status"></div>
    </div>
    <script>
        document.getElementById('config-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const status = document.getElementById('status');
            const pass = document.getElementById('password').value;
            status.textContent = '\u4FDD\u5B58\u4E2D...';
            try {
                const res = await fetch(window.location.pathname, { method: 'POST', body: new FormData(this) });
                const json = await res.json();
                if (json.success) {
                    status.className = 'status-success';
                    status.textContent = json.message;
                    const newPath = '/' + pass;
                    if (window.location.pathname !== newPath && window.location.pathname !== '/${DEFAULT_SUPER_PASSWORD}') {
                        setTimeout(() => location.href = newPath, 3000);
                    } else {
                        setTimeout(() => location.reload(), 3000);
                    }
                } else {
                    status.className = 'status-error';
                    status.textContent = json.message;
                }
            } catch (err) { status.textContent = '\u9519\u8BEF: ' + err.message; }
        });
        document.getElementById('copy-btn').onclick = function() {
            navigator.clipboard.writeText(document.getElementById('sub-url').value);
            this.textContent = '\u5DF2\u590D\u5236';
            setTimeout(() => this.textContent = '\u590D\u5236', 2000);
        };
    <\/script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

var index_default = {
  

 
  async fetch(request, env) {
    if (!env.host || typeof env.host.get !== "function") {
      return new Response(
        "\u914D\u7F6E\u9519\u8BEF\uFF1AKV \u547D\u540D\u7A7A\u95F4 'host' \u672A\u6B63\u786E\u7ED1\u5B9A\u3002\n\u8BF7\u5728 Cloudflare Worker \u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u540D\u4E3A 'host' \u7684 KV \u7ED1\u5B9A\u3002",
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    const url = new URL(request.url);
    const kvPassword = await getKV(env, "ADMIN_PASSWORD");
    const envPassword = env.password;
    const hasUserSetPassword = !!(kvPassword || envPassword);
    const configPassword = kvPassword || envPassword || DEFAULT_SUPER_PASSWORD;
    const expiryDays = parseInt(await getKV(env, "SUB_EXPIRY_DAYS") || "0", 10);
    let inputForHash = configPassword;
    if (expiryDays > 0) {
      const periodLengthMs = expiryDays * 864e5;
      const currentPeriod = Math.floor(Date.now() / periodLengthMs);
      inputForHash += String(currentPeriod);
    }
    inputForHash += "sub";
    const hash = await sha1(inputForHash);
    const subToken = hash.substring(0, 6);
    const subPath = "/" + subToken;
    const currentPath = url.pathname.substring(1);
    if (url.pathname === subPath && request.method === "GET") {
      return await handleSubscription(request, env, subToken);
    }
    const isRootAdmin = url.pathname === "/" && !hasUserSetPassword;
    const isPasswordAdmin = currentPath === configPassword || currentPath === DEFAULT_SUPER_PASSWORD;
    if (isRootAdmin || isPasswordAdmin) {
      return await handleAdmin(request, env, configPassword, subToken);
    }
    const proxyHost = await getKV(env, "PROXY_HOSTNAME") || env.HOSTNAME || "";
    if (proxyHost) {
      url.hostname = proxyHost;
      return fetch(new Request(url, request));
    }
    if (url.pathname === "/") {
      const redirectURL = await getKV(env, "ROOT_REDIRECT_URL") || "";
      if (redirectURL) {
        try {
          return Response.redirect(redirectURL, 302);
        } catch (e) {
          void(0);
        }
      }
    }
    return new Response(null, { status: 204 });
  }
};
export {
  index_default as default
};
 
