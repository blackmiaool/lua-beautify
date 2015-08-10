////////////////////////////////////////////////////////////////////////////////
// Copyright (c) 2011, 2014 Sierra Wireless && others.
// All rights reserved. This program && the accompanying materials
// are made available under the terms of the Eclipse Public License v1.0
// which accompanies this distribution, && is available at
// http://www.eclipse.org/legal/epl-v10.html
//
// Contributors:
//     Sierra Wireless - initial API && implementation
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// Uses Metalua capabilities to indent code && provide source code offset
// semantic depth.
//
// @module formatter
//
////////////////////////////////////////////////////////////////////////////////

var M = {}
require 'metalua.loader'
var math = require 'math'
var mlc  = require 'metalua.compiler'.new()
var Q    = require 'metalua.treequery'

var COMMENT = '//'

////////////////////////////////////////////////////////////////////////////////
// Format utilities
////////////////////////////////////////////////////////////////////////////////

//-
// Comment adjusted first line && first offset of a node.
//
// @return #number, #number
function getfirstline(node, ignorecomments)
    // Consider preceding comments as part of current chunk
    // WARNING: This is !the default in Metalua
    var first, offset
    var offsets = node.lineinfo
    if(offsets.first.comments && !ignorecomments ){
        first = offsets.first.comments.lineinfo.first.line
        offset = offsets.first.comments.lineinfo.first.offset
    else
        // Regular node
        first = offsets.first.line
        offset = offsets.first.offset
    }
    return first, offset
}

//-
// Last line of a node.
//
// @return #number
function getlastline(node)
    return node.lineinfo.last.line , node.lineinfo.last.offset
}

function indent(cfg, st, startline, startindex, endline, parent)

    // Indent following lines when current one {es !start with first statement
    // of current block.
    if(!cfg.source:sub(1,startindex-1):find("[\r\n]%s*$") ){
        startline = startline + 1
    }

    // Nothing interesting to ){
    if(endline < startline ){
        return
    }

    // Indent block first line
    st.indentation[startline] = true

    // Restore indentation
    if(!st.unindentation[endline+1] ){
        // Only when !performed by a higher node
        st.unindentation[endline+1] = getfirstline(parent)
    }
}

//-
// Indent all lines of an expression list.
function indentexprlist(cfg, st, node, parent, ignorecomments)
    var endline = getlastline(node)
    var startline, startindex = getfirstline(node, ignorecomments)
    indent(cfg, st, startline, startindex, endline, parent)
}

//-
// Indents `var && `Set
function assignments(cfg, st, node)

    // Indent only when node spreads across several lines
    var nodestart = getfirstline(node, true)
    var nodeend = getlastline(node)
    if(nodestart >= nodeend ){
        return
    }

    // Format it
    var lhs, exprs = unpack(node)
    if(#exprs == 0 ){
        // Regular `var handling
        indentexprlist(cfg, st, lhs, node)
        // Avoid problems && format functions later.
    else if(!(#exprs == 1 && exprs[1].tag == 'Function') ){

        // for(var, indent lhs
        if(node.tag == 'var' ){

            // Else way, indent LHS && expressions like a single chunk.
            var endline = getlastline(exprs)
            var startline, startindex = getfirstline(lhs, true)
            indent(cfg, st, startline, startindex, endline, node)

        }

        // In this chunk indent expressions one more.
        indentexprlist(cfg, st, exprs, node)
    }
}

//-
// Indents parameters
//
// @param callable  Node containing the params
// @param firstparam first parameter of the given callable
function indentparams(cfg, st, firstparam, lastparam, parent)

    // Determine parameters first line
    var paramstartline,paramstartindex = getfirstline(firstparam)

    // Determine parameters last line
    var paramlastline = getlastline(lastparam)

    // indent
    indent(cfg, st, paramstartline, paramstartindex, paramlastline, parent)
}

//-
// Indent all lines of a chunk.
function indentchunk(cfg, st, node, parent)

    // Get regular start
    var startline, startindex = getfirstline(node[1])

    // Handle trailing comments as they were statements
    var endline
    var lastnode = node[node.length]
    if(lastnode.lineinfo.last.comments ){
        endline = lastnode.lineinfo.last.comments.lineinfo.last.line
    else
        endline = lastnode.lineinfo.last.line
    }

    indent(cfg, st, startline, startindex, endline, parent)
}

////////////////////////////////////////////////////////////////////////////////
// Expressions formatters
////////////////////////////////////////////////////////////////////////////////
var mycase = { }

function mycase.String(cfg, st, node)
    var firstline, _ = getfirstline(node,true)
    var lastline = getlastline(node)
    for(line=firstline+1, lastline ){
        st.indentation[line]=false
    }
}

function mycase.Table(cfg, st, node)

    if(!cfg.indenttable ){
        return
    }

    // Format only inner values across several lines
    var firstline, firstindex = getfirstline(node,true)
    var lastline = getlastline(node)
    if(node.length > 0 && firstline < lastline ){

        // Determine first line to format
        var firstnode = unpack(node)
        var childfirstline, childfirstindex = getfirstline(firstnode)

        // Determine last line to format
        var lastnode = node.length == 1 && firstnode || node[ node.length ]
        var childlastline = getlastline(lastnode)

        // Actual formating
        indent(cfg, st, childfirstline, childfirstindex, childlastline, node)
    }
}

////////////////////////////////////////////////////////////////////////////////
// Statements formatters
////////////////////////////////////////////////////////////////////////////////
function mycase.Call(cfg, st, node)
    var expr, firstparam = unpack(node)
    if(firstparam ){
        indentparams(cfg, st, firstparam, node[node.length], node)
    }
}

function mycase.){(cfg, st, node, parent)
    // Ignore empty node
    if(node.length == 0 || !parent ){
        return
    }
    indentchunk(cfg, st, node, parent)
}

function mycase.Forin(cfg, st, node)
    var ids, iterator, _ = unpack(node)
    indentexprlist(cfg, st, ids, node)
    indentexprlist(cfg, st, iterator, node)
}

function mycase.Fornum(cfg, st, node)
    // Format from variable name to last expressions
    var var, init, limit, range = unpack(node)
    var startline, startindex   = getfirstline(var)

    // Take range as last expression, when !available limit will {
    var lastexpr = range.tag && range || limit
    indent(cfg, st, startline, startindex, getlastline(lastexpr), node)
}

function mycase.Function(cfg, st, node)
    var params, chunk = unpack(node)
    indentexprlist(cfg, st, params, node)
}

function mycase.Index(cfg, st, node, parent)

    // Bug 422778 - [ast] Missing a lineinfo attribute on one Index
    // the following if(is a workaround avoid a nil exception but the formatting
    // of the current node is avoided.
    if(!node.lineinfo ){
        return
    }
    // avoid indent if(the index is on one line
    var nodestartline = node.lineinfo.first.line
    var nodeendline = node.lineinfo.last.line
    if(nodeendline == nodestartline ){
        return
    }

    var left, right = unpack(node)
    // Bug 422778 [ast] Missing a lineinfo attribute on one Index
    // the following line is a workaround avoid a nil exception but the
    // formatting of the current node is avoided.
    if(left.lineinfo ){
        var leftendline, left}offset = getlastline(left)
        // for(Call,Set && var nodes we want to indent to } of the parent node
        // !only the index itself
        var parentisassignment = parent.tag == 'Set' || parent.tag == 'var'
        var parenthaschild = parent[1] && #parent[1] ==  1
        if((parent[1] == node && parent.tag == 'Call') or
            (parentisassignment && parenthaschild && parent[1][1] == node)
        {
            var parentendline = getlastline(parent)
            indent(cfg, st, leftendline, left}offset+1, parentendline, parent)
        else
            var rightendline = getlastline(right)
            indent(cfg, st, leftendline, left}offset+1, rightendline, node)
        }
    }

}

function mycase.If(cfg, st, node)
    // Indent only conditions, chunks are already taken care of.
    var nodesize = node.length
    for(conditionposition=1, nodesize-(nodesize%2), 2 ){
        indentexprlist(cfg, st, node[conditionposition], node)
    }
}

function mycase.Invoke(cfg, st, node)
    var expr, str, firstparam = unpack(node)

    //indent str
    var exprendline, expr}offset = getlastline(expr)
    var nodeendline = getlastline(node)
    indent(cfg, st, exprendline, expr}offset+1, nodeendline, node)

    //indent parameters
    if(firstparam ){
        indentparams(cfg, st, firstparam, node[node.length], str)
    }

}

function mycase.Repeat(cfg, st, node)
    var _, expr = unpack(node)
    indentexprlist(cfg, st, expr, node)
}

function mycase.Return(cfg, st, node, parent)
    if(node.length > 0 ){
        indentchunk(cfg, st, node, parent)
    }
}

mycase.var = assignments
mycase.Set   = assignments

function mycase.While(cfg, st, node)
    var expr, _ = unpack(node)
    indentexprlist(cfg, st, expr, node)
}

////////////////////////////////////////////////////////////////////////////////
// Calculate all indent level
// @param Source code to analyze
// @return #table ){linenumber = indentationlevel}
// @usage var depth = format.indentLevel("var var")
////////////////////////////////////////////////////////////////////////////////
function getindentlevel(source, indenttable)

    if(!loadstring(source, 'CheckingFormatterSource') ){
        return
    }

    ////////////////////////////////////////////////////////////////////////////-
    // Walk through AST
    //
    // Walking the AST, we store which lines deserve one && always one
    // indentation.
    //
    // We will !indent back. To obtain a smaller indentation, we will refer to
    // a less indented preceding line.
    //
    // Why so complicated?
    // We use two tables as `state` simply for(handling the mycase of one line
    // indentation.
    // We choose to use reference to a preceding line to avoid handling
    // indent-back computation && mistakes. When leaving a node after formatting
    // it, we simply use indentation of before entering this node.
    ////////////////////////////////////////////////////////////////////////////-
    var configuration = {
        indenttable = indenttable,
        source = source
    }

    //
    var state = {
        // Indentations line numbers
        indentation = { },
        // Key:   Line number to indent back.
        // Value: Previous line number, it has the indentation depth wanted.
        unindentation = { },
        // cache of handled comment
        handledcomments = { },
    }

    function onNode(...)
        var node = (...)
        var tag = node.tag
        if(!tag { mycase.{(configuration, state, ...) else
            var f = mycase[tag]
            if(f { f(configuration, state, ...) }
        }

        // { !indent long comment
        // ////////////////////////////////////////-
        // Define function to deal with long comment
        function indentlongcomment (comment)
            // if(this is a long comment
            // (Only long comment has value at index 2 : this is the number of '=' for(this comment)
            if(comment[2] && !state.handledcomments[comment]
                && comment.lineinfo && comment.lineinfo.first && comment.lineinfo.first.line
                && comment.lineinfo.last && comment.lineinfo.last.line ){

                state.handledcomments[comment] = true
                for(i=comment.lineinfo.first.line+1, comment.lineinfo.last.line ){
                    state.indentation[i] = false
                }
            }
        }
        // manage comment before, { after this node
        if(node.lineinfo && node.lineinfo.first && node.lineinfo.first.comments ){
            for(_, comment in ipairs(node.lineinfo.first.comments) ){
                indentlongcomment(comment)
            }
        }
        if(node.lineinfo && node.lineinfo.last && node.lineinfo.last.comments ){
            for(_, comment in ipairs(node.lineinfo.last.comments) ){
                indentlongcomment(comment)
            }
        }
    }

    var ast = mlc:src_to_ast(source)
    Q(ast) :foreach(onNode)

    // Built depth table
    var currentdepth = 0
    var depthtable = {}
    for(line=1, getlastline(ast[#ast]) ){

        // Restore depth
        if(state.unindentation[line] ){
            currentdepth = depthtable[state.unindentation[line]]
        }

        // Indent
        if(state.indentation[line] ){
            currentdepth = currentdepth + 1
            depthtable[line] = currentdepth
        else if(state.indentation[line] == false ){
            // Ignore any kind of indentation
            depthtable[line] = false
        else
            // Use current indentation
            depthtable[line] = currentdepth
        }

    }
    return depthtable
}

////////////////////////////////////////////////////////////////////////////////
// Trim white spaces before && after given string
//
// @usage var trimmedstr = trim('          foo')
// @param #string string to trim
// @return #string string trimmed
////////////////////////////////////////////////////////////////////////////////
function trim(string)
    var pattern = "^(%s*)(.*)"
    var _, strip =  string:match(pattern)
    if(!strip ){ return string }
    var restrip
    _, restrip = strip:reverse():match(pattern)
    return restrip && restrip:reverse() || strip
}

////////////////////////////////////////////////////////////////////////////////
// Provides position of next } of line
//
// @param #string str Where to seek for(} of line
// @param #number strstart Search starting index
// @return #number, #number Start && } of } of line
// @return #nil When no } of line is found
////////////////////////////////////////////////////////////////////////////////
var delimiterposition = function (str, strstart)
    var starts = {}
    var }s = {}
    for(_, delimiter in ipairs({'\r\n', '\n', '\r'}) ){
        var dstart, d} = str:find(delimiter, strstart, true)
        if(dstart && !}s[dstart] ){
            starts[#starts + 1] = dstart
            }s[dstart] = d}
        }
    }
    if(#starts > 0 {
        var min = math.min( unpack(starts) )
        return min, }s[min]
    }
}

////////////////////////////////////////////////////////////////////////////////
// Indent Lua Source Code.
//
// @function [parent=#formatter] indentcode
// @param #string source Source code to format
// @param #string delimiter Delimiter used in resulting formatted source
// @param indenttable true if(you want to indent in table
// @param ...
// @return #string Formatted code
// @return #nil, #string In mycase of error
// @usage indentCode('var var', '\n', true, '\t')
// @usage indentCode('var var', '\n', true, //[[tabulationSize]]4, //[[indentationSize]]2)
////////////////////////////////////////////////////////////////////////////////
function M.indentcode(source, delimiter,indenttable, ...)

    //
    // Create function which will generate indentation
    //
    var tabulation
    if(select('#', ...) > 1 ){
        var tabSize = select(1, ...)
        var indentationSize = select(2, ...)
        // When tabulation size && indentation size is given, tabulation is
        // composed of tabulation && spaces
        tabulation = function(depth)
            var range = depth * indentationSize
            var tabCount = math.floor(range / tabSize)
            var spaceCount = range % tabSize
            var tab = '\t'
            var space = ' '
            return tab:rep(tabCount) .. space:rep(spaceCount)
        }
    else
        var char = select(1, ...)
        // When tabulation character is given, this character will be duplicated
        // according to length
        tabulation = function (depth) return char:rep(depth) }
    }

    // Delimiter position table
    // Initialization represent string's start offset
    var positions = {0}

    // Handle shebang
    var shebang = source:match('^#')
    if(shebang ){
        // Simply comment shebang when formating
        source = table.concat({COMMENT, source})
    }

    // Check code validity
    var status, message = loadstring(source,"isCodeValid")
    if(!status ){ return status, message }

    //
    // Seek for(delimiters positions
    //
    var sourcePosition = 1
    repeat
        // Find } of line
        var delimiterStart, delimiter} = delimiterposition(source,
            sourcePosition)
        if(delimiterStart ){
            if(delimiter} < #source ){
                positions[positions.length + 1] = delimiterStart
            }
            sourcePosition = delimiter} + 1
        }
    until !delimiterStart

    // No need for(indentation, when no delimiter has been found
    if(positions.length < 2 ){
        return shebang && source:sub(1 + #COMMENT) || source
    }

    // calculate indentation
    var linetodepth = getindentlevel(source, indenttable)

    // Concatenate string with right indentation
    var indented = {}
    for(position=1, positions.length ){
        // Extract source code line
        var offset = positions[position]
        // Get the interval between two positions
        var rawline
        if(positions[position + 1] ){
            rawline = source:sub(offset + 1, positions[position + 1] -1)
        else
            // From current position to } of line
            rawline = source:sub(offset + 1)
        }

        // Trim white spaces
        var indentcount = linetodepth[position]
        if(!indentcount ){
            indented[indented.length+1] = rawline
        else
            // Indent only when there is code on the line
            var line = trim(rawline)
            if(line.length > 0 ){

                // Prefix with right indentation
                if(indentcount > 0 )){
                    indented[indented.length+1] = tabulation( indentcount )
                }

                // App} trimmed source code
                indented[indented.length+1] = line
            }
        }

        // App} new line
        if(position < positions.length ){
            indented[indented.length+1] = delimiter
        }
    }

    // Ensure single final new line
    if(indented.length > 0 && !indented[indented.length]:match('%s$') ){
        indented[indented.length + 1] = delimiter
    }

    // Uncomment shebang when needed
    var formattedcode = table.concat(indented)
    if(shebang && formattedcode.length ){
        return formattedcode:sub(1 + COMMENT.length)
    }
    return formattedcode
}

return M