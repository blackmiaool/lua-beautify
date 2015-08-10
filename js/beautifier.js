var COMMENT = '//';









function getfirstline(node, ignorecomments) {
    // Consider preceding comments as part of current chunk
    // WARNING: This is NOT the default in Metalua
    var first, offset;
    var offsets = node.lineinfo;
    if (offsets.first.comments && !ignorecomments) {
        first = offsets.first.comments.lineinfo.first.line;
        offset = offsets.first.comments.lineinfo.first.offset;
    } else {
        // Regular node
        first = offsets.first.line;
        offset = offsets.first.offset;
    }
    return [first, offset];
}
function getlastline(node){
    return [node.lineinfo.last.line , node.lineinfo.last.offset]
}

function indent(cfg, st, startline, startindex, endline, parent)
{
    // Indent following lines when current one {es not start with first statement
    // of current block.
    if(!cfg.source.sub(1,startindex-1).find("[\r\n]%s*$") ){
        startline = startline + 1
    }

    // Nothing interesting to ){
    if(endline < startline ){
        return
    }

    // Indent block first line
    st.indentation[startline] = true

    // Restore indentation
    if(! st.unindentation[endline+1] ){
        // Only when not performed by a higher node
        st.unindentation[endline+1] = getfirstline(parent)
    }
}

function indentexprlist(cfg, st, node, parent, ignorecomments){
    var endline = getlastline(node)
    var startline, startindex = getfirstline(node, ignorecomments)
    indent(cfg, st, startline, startindex, endline, parent)
}

function assignments(cfg, st, node){

    // Indent only when node spreads across several lines
    var nodestart = getfirstline(node, true)
    var nodeend = getlastline(node)
    if(nodestart >= nodeend ){
        return
    }

    // Format it
    var lhs, exprs = unpack(node)
    if(exprs.length == 0 ){
        // Regular `var handling
        indentexprlist(cfg, st, lhs, node)
        // Avoid problems && format functions later.
    }
    else if(! (exprs.length == 1 && exprs[1].tag == 'Function') ){

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

function indentparams(cfg, st, firstparam, lastparam, parent)
{
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
{
    // Get regular start
    var startline, startindex = getfirstline(node[1])

    // Handle trailing comments as they were statements
    var endline
    var lastnode = node[node.length]
    if(lastnode.lineinfo.last.comments ){
        endline = lastnode.lineinfo.last.comments.lineinfo.last.line}
    else{
        endline = lastnode.lineinfo.last.line
    }

    indent(cfg, st, startline, startindex, endline, parent)
}
                        
var mycase = { }

mycase.String=function(cfg, st, node)
{
    var firstline, _ = getfirstline(node,true)
    var lastline = getlastline(node)
    for(var line=firstline+1;line<lastline;line++){
        st.indentation[line]=false
    }
}

mycase.Table=function(cfg, st, node)
{
    if(! cfg.indenttable ){
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

mycase.Call=function(cfg, st, node){
    var expr, firstparam = unpack(node)
    if(firstparam ){
        indentparams(cfg, st, firstparam, node[node.length], node)
    }
}

mycase.enddo=function(cfg, st, node, parent){
    // Ignore empty node
    if(node.length == 0 || !parent ){
        return
    }
    indentchunk(cfg, st, node, parent)
}

mycase.Forin=function(cfg, st, node){
    var ids, iterator, _ = unpack(node)
    indentexprlist(cfg, st, ids, node)
    indentexprlist(cfg, st, iterator, node)
}

mycase.Fornum=function(cfg, st, node){
    // Format from variable name to last expressions
    var luavar, init, limit, range = unpack(node)
    var startline, startindex   = getfirstline(luavar)

    // Take range as last expression, when !available limit will {
    var lastexpr = range.tag && range || limit
    indent(cfg, st, startline, startindex, getlastline(lastexpr), node)
}

mycase.Function=function(cfg, st, node){
    var params, chunk = unpack(node)
    indentexprlist(cfg, st, params, node)
}
        

 mycase.Index=function(cfg, st, node, parent){

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
        var leftendline, leftendoffset = getlastline(left)
        // for(Call,Set && var nodes we want to indent to } of the parent node
        // !only the index itself
        var parentisassignment = parent.tag == 'Set' || parent.tag == 'var'
        var parenthaschild = parent[1] && parent[1].length ==  1
        if((parent[1] == node && parent.tag == 'Call') ||
            (parentisassignment && parenthaschild && parent[1][1] == node))
        {
            var parentendline = getlastline(parent)
            indent(cfg, st, leftendline, leftdooffset+1, parentendline, parent)}
        else{
            var rightendline = getlastline(right)
            indent(cfg, st, leftendline, leftdooffset+1, rightendline, node)
        }
    }

}

 
 
 
 
mycase.If=function (cfg, st, node){
    // Indent only conditions, chunks are already taken care of.
    var nodesize = node.length
    for(var conditionposition=1; conditionposition<nodesize-(nodesize%2); conditionposition+=2){
        indentexprlist(cfg, st, node[conditionposition], node)
    }
}

mycase.Invoke=function(cfg, st, node){
    var expr, str, firstparam = unpack(node)

    //indent str
    var exprendline, exprendoffset = getlastline(expr)
    var nodeendline = getlastline(node)
    indent(cfg, st, exprendline, exprendoffset+1, nodeendline, node)

    //indent parameters
    if(firstparam ){
        indentparams(cfg, st, firstparam, node[node.length], str)
    }

}

mycase.Repeat=function(cfg, st, node){
    var _, expr = unpack(node)
    indentexprlist(cfg, st, expr, node)
}
mycase.Return=function(cfg, st, node, parent){
    if(node.length > 0 ){
        indentchunk(cfg, st, node, parent)
    }
}

mycase.var = assignments
mycase.Set   = assignments

mycase.While=function(cfg, st, node){
    var expr, _ = unpack(node)
    indentexprlist(cfg, st, expr, node)
}
 function trim(string){
    var pattern = "^(%s*)(.*)"
    var _, strip =  string.match(pattern)
    if(!strip ){ return string }
    var restrip
    _, restrip = strip.reverse().match(pattern)
    return restrip && restrip.reverse() || strip
}


 
 
 
 
 

function beautify(source) {
    source = source.replace(/\r/g, "")
    var delimiter = "\n";
    var tabs_create = function (len) {
        if (len == 0) {
            return "";
        }
        var ret = "";
        var tab = "    "
        for (var i = 0; i < len; i++) {
            ret += tab;
        }
        return ret;
    }


    var positions = [0];
    var shebang = (new RegExp("^#")).test(source);
    if (shebang) {
        source = "--" + source;
    }

    var sourcePosition = 1;
    do {

        var delimiter = delimiterposition(source, sourcePosition);

        if (delimiter.start) {
            if (delimiter.end < source.length) {
                positions[positions.length] = delimiter.start;
            }
            sourcePosition = delimiter.end + 1;

        }
    } while (delimiter.start);

    if (positions.length < 2) {
        return shebang && source.substr(2) || source;
    }

    var linetodepth = getindentlevel(source, true);//TODO

    
    
    
    
    
    
    var indented = {}
    for(var position=1;position<positions.length;position++ ){
        // Extract source code line
        var offset = positions[position]
        // Get the interval between two positions
        var rawline
        if(positions[position + 1] ){
            rawline = source.sub(offset + 1, positions[position + 1] -1)}
        else{
            // From current position to } of line
            rawline = source.sub(offset + 1)
        }

        // Trim white spaces
        var indentcount = linetodepth[position]
        if(!indentcount ){
            indented[indented.length+1] = rawline}
        else{
            // Indent only when there is code on the line
            var line = trim(rawline)
            if(line.length > 0 ){

                // Prefix with right indentation
                if(indentcount > 0 ){
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
    if(indented.length > 0 && !indented[indented.length].match('%s$') ){
        indented[indented.length + 1] = delimiter
    }

    // Uncomment shebang when needed
    var formattedcode = table.concat(indented);
    if(shebang && formattedcode.length ){
        return formattedcode.sub(1 + COMMENT.length);
    }
    
    
    
    
    
    
    return source;
}

function getindentlevel(source, indenttable) {
    var configuration = {
        indenttable: indenttable,
        source: source
    }
    var state = {
        //        Indentations line numbers
        indentation: {},
        //        Key:   Line number to indent back.
        //        Value: Previous line number, it has the indentation depth wanted.
        unindentation: {},
        //        cache of handled comment
        handledcomments: {},
    }

    function onNode() {
        var node = arguments[0];
        var tag = node.tag;
        if (!tag) {
            var args = arguments;
            args.unshift(configuration);
            args.unshift(state);
            mycase.Do.apply(false, args)
        } else {
            var f = mycase[tag];
            if (f) {
                var args = arguments;
                args.unshift(configuration);
                args.unshift(state);
                f.apply(undefined, args)
            }
        }

        function indentlongcomment(comment) {
            if (comment[2] && !state.handledcomments[comment] && comment.lineinfo && comment.lineinfo.first && comment.lineinfo.first.line && comment.lineinfo.last && comment.lineinfo.last.line) {

                state.handledcomments[comment] = true
                for (i = comment.lineinfo.first.line + 1; i < comment.lineinfo.last.line; i++)
                    state.indentation[i] = false
            }
        }
    }

    if (node.lineinfo && node.lineinfo.first && node.lineinfo.first.comments) {
        for (var i in node.lineinfo.first.comments) {
            comment = node.lineinfo.first.comments[i];
            indentlongcomment(comment)
        }


    }
    if (node.lineinfo && node.lineinfo.last && node.lineinfo.last.comments) {
        for (var i in node.lineinfo.last.comments) {
            comment = node.lineinfo.last.comments[i];
            indentlongcomment(comment)
        }
    }


}

function delimiterposition(str, strstart) {
    var index = str.indexOf("\n", strstart)
    console.log(index);
    if (index > -1)
        return {
            start: index,
            end: index + 1
        };
    else
        return false;

}