const ws = require('ws')
const http = require('http')
const fs = require('fs')

const EMPTY = '-'
var active_pairs = []
var unmatched_client = null
var turn = []
var states = {}
var blocked = []
const symbols = ['X', 'O']

const readFile = filename => new Promise(resolve => fs.readFile(filename, 'utf-8', (err, data) => resolve(data)))

const create_msg = (type, data) =>
{
    let msg = {}
    msg['type'] = type
    msg['data'] = data
    return JSON.stringify(msg)
}

const update_client_pair = (pair, msg) =>
{
    pair[0].send(msg)
    pair[1].send(msg)
}

const start_match = game_id => 
{
    let state = {}
    for(var i = 0; i < 6; ++i)
    {
        for(var j = 0; j < 7; ++j)
            state[`${i}x${j}`] = EMPTY
    }

    states[game_id] = state
    
    update_client_pair(active_pairs[game_id], create_msg('game_id', game_id))
    update_client_pair(active_pairs[game_id], create_msg('info', 'Match started'))
    update_client_pair(active_pairs[game_id], create_msg('state_update', state))
}

const daig = (game_id, pos, sign, symbol) => 
{
    const row = parseInt(pos[0], 10)
    const col = parseInt(pos[2], 10)

    let consec = 0
    for(var i = -3; i < 4; ++i)
    {
        let r = row + sign * i
        let c = col + i
        if(r < 0 || r >= 6 || c < 0 || c > 6)
            continue
        if(states[game_id][`${r}x${c}`] == symbol)
        {
            if(++consec == 4)
                return true
        }
        else consec = 0
    }
    return false
}
const vert = (game_id, pos, symbol) => 
{
    const row = parseInt(pos[0], 10)
    const col = parseInt(pos[2], 10)

    let consec = 0
    let c = col
    for(var i = -3; i < 4; ++i)
    {
        let r = row - i
        if(r < 0 || r >= 6 || c < 0 || c > 6)
            continue
        if(states[game_id][`${r}x${c}`] == symbol)
        {
            if(++consec == 4)
                return true
        }
        else consec = 0
    }
    return false
}
const hor = (game_id, pos, symbol) => 
{
    const row = parseInt(pos[0], 10)
    const col = parseInt(pos[2], 10)

    let consec = 0
    let r = row
    for(var i = -3; i < 4; ++i)
    {
        let c = col + i
        if(r < 0 || r >= 6 || c < 0 || c > 6)
            continue
        if(states[game_id][`${r}x${c}`] == symbol)
        {
            if(++consec == 4)
                return true
        }
        else consec = 0
    }
    return false
}
const check_win = (game_id, pos, s) =>
{
    return daig(game_id, pos, -1, s) || daig(game_id, pos, 1, s) || vert(game_id, pos, s) || hor(game_id, pos, s)
}

const valid_move = (game_id, col) =>
{
    if(states[game_id][`0x${col}`] != EMPTY)
    {
        active_pairs[game_id][turn[game_id]].send(create_msg('info', 'column full!'))
        return false
    }
    return true
}

const apply_move = (game_id, col) =>
{
    if(!valid_move(game_id, col))
        return
    
    let ins_point = ''
    for(var i = 0; i < 6; ++i)
    {
        if(states[game_id][`${i}x${col}`] != EMPTY)
        {
            ins_point = `${i-1}x${col}`
            states[game_id][ins_point] = symbols[turn[game_id]]
            break;
        }
        if(i == 5)
        {
            ins_point = `${i}x${col}`
            states[game_id][ins_point] = symbols[turn[game_id]]
        }
            
    }

    update_client_pair(active_pairs[game_id], create_msg('state_update', states[game_id]))
    if(check_win(game_id, ins_point, symbols[turn[game_id]]))
    {
        active_pairs[game_id][turn[game_id]].send(create_msg('info', 'You WIN!'))
        active_pairs[game_id][(turn[game_id]+1)%2].send(create_msg('info', 'You luzr!'))
        blocked[game_id] = true
        //start_match(game_id)
    }
    turn[game_id] = (turn[game_id] + 1) % 2
}

const remove_dummy_move = (game_id, col) =>
{
    for(var i = 0; i < 6; ++i)
    {
        if(states[game_id][`${i}x${col}`] != EMPTY)
        {
            states[game_id][`${i}x${col}`] = EMPTY
            return
        }
    }

}

const apply_dummy_move = (game_id, col, symbol) =>
{
    let ins_point = ''
    for(var i = 0; i < 6; ++i)
    {
        if(states[game_id][`${i}x${col}`] != EMPTY)
        {
            ins_point = `${i-1}x${col}`
            states[game_id][ins_point] = symbol
            break;
        }
        if(i == 5)
        {
            ins_point = `${i}x${col}`
            states[game_id][ins_point] = symbol
        }
            
    }

    return ins_point
}

const predict_opponent_win = (game_id, col, t) =>
{
    let dummy_check = apply_dummy_move(game_id, col, symbols[t])
    if(check_win(game_id, dummy_check, symbols[t]))
    {
        remove_dummy_move(game_id, col)
        return false
    }
    for(var c = 0; c < 7; ++c)
    {
        if(!valid_move(game_id, c))
            continue
        let ins_point = apply_dummy_move(game_id, c, symbols[(t+1)%2])
        if(check_win(game_id, ins_point, symbols[(t+1)%2]))
        {
            remove_dummy_move(game_id, c)
            remove_dummy_move(game_id, col)
            return true

        }
        remove_dummy_move(game_id, c)
    }
    remove_dummy_move(game_id, col)
    return false

}

const decide_color = (game_id, col, t) =>
{
    if(predict_opponent_win(game_id, col, t))
        return 'red-grid-item'

    return 'green-grid-item'
}

const message_handler = (client, msg) =>
{
    let type = msg['type']
    let data = msg['data']
    let game_id = msg['game_id'] 
    let player_id = msg['player_id'] 

    if(blocked[game_id])
        return

    if(type === 'on_click')
    {
        if(player_id === turn[game_id])
            apply_move(game_id, data)
        else
            client.send(create_msg('info', 'not your turn'))
    }

    if(type === 'mouse_hover')
    {
        let color = decide_color(game_id, data, player_id)
        client.send(create_msg('highlight', {0: data, 1:color}))
    }
}

const onClientConnected = client =>
{
    console.log(`client connected`)
    if(unmatched_client)
    {
        active_pairs.push([unmatched_client, client])
        turn.push(0)
        blocked.push(false)
        unmatched_client.send(create_msg('player_id', 0))
        client.send(create_msg('player_id', 1))
        unmatched_client = null
        let game_id = active_pairs.length -1
        start_match(game_id)
    }
    else
    {
        unmatched_client = client
        client.send(create_msg('info', 'wait for player'))
    }

    client.on('message', msg =>
        {
            message_handler(client, JSON.parse(msg));
        })
}

const server = http.createServer(async (req, resp) =>
    {
        if(req.url === '/')
            resp.end(await readFile('connect4_clientside.html'))
        else if(req.url === '/vue.js')
            resp.end(await readFile('vue.js'))
        else if(req.url === '/connect4_clientside.js')
            resp.end(await readFile('connect4_clientside.js'))
        else
            resp.end('sowwy :(((');
    })

new ws.Server({server}).on('connection', onClientConnected)

server.listen(6969)
console.log(`listening on port`)
